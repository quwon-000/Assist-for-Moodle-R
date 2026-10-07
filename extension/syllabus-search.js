// シラバスサイト側の処理（document_start で実行）。
// - 授業ページ (/r-syllabus/{ID}/{年度}{授業コード}) を開いたら、その URL を保存する
// - 検索ページを #mx-syllabus=CODE&year=YYYY 付きで開いたら、途中の画面を隠したまま該当シラバスへ移動する
//   1. シラバスサイトの検索 API を直接呼んで URL を求め、すぐ移動する（通常はこれで終わる）
//      ※ API は他サイトからの呼び出しを拒否する（401）ため、このページ内から呼ぶ
//   2. 失敗したら検索フォームを自動操作する
(() => {
  const RECORD_PATTERN = /\/r-syllabus\/[A-Za-z0-9]+\/(\d{4})(\d{5})\/?$/;
  const API_URL = '/syllabus/s/sfsites/aura?r=1&aura.ApexAction.execute=1';

  const saveUrl = (key, url) => {
    chrome.storage.local.get('syllabusUrls', (data) => {
      const urls = (data && data.syllabusUrls) || {};
      urls[key] = url;
      chrome.storage.local.set({ syllabusUrls: urls });
    });
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitFor = async (find, timeoutMs) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = find();
      if (found) {
        return found;
      }
      await sleep(200);
    }
    return null;
  };

  const record = location.pathname.match(RECORD_PATTERN);
  if (record) {
    saveUrl(`${record[1]}${record[2]}`, `${location.origin}${location.pathname}?language=ja`);
    return;
  }

  const params = new URLSearchParams(location.hash.slice(1));
  const code = params.get('mx-syllabus');
  const year = params.get('year');
  if (!/^\d{5}$/.test(code || '') || !/^\d{4}$/.test(year || '')) {
    return;
  }

  const recordUrl = (id) => `${location.origin}/syllabus/s/r-syllabus/${id}/${year}${code}?language=ja`;

  // ---- 検索の途中経過を隠す覆い ----
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:12px', 'background:#fff', 'color:#333',
    'font:16px/1.5 sans-serif',
  ].join(';');
  overlay.innerHTML = '<div style="width:32px;height:32px;border:4px solid #eee;border-top-color:#ac413d;'
    + 'border-radius:50%;animation:mxspin .8s linear infinite"></div><div></div>'
    + '<style>@keyframes mxspin{to{transform:rotate(360deg)}}</style>';
  overlay.children[1].textContent = `シラバスを開いています…（${code}）`;
  (document.documentElement || document).append(overlay);

  const go = (url) => {
    saveUrl(`${year}${code}`, url);
    location.replace(url);
  };

  // シラバスサイトの検索フォームが内部で呼んでいるのと同じ API
  const searchByApi = async () => {
    const message = {
      actions: [{
        id: '1;a',
        descriptor: 'aura://ApexActionController/ACTION$execute',
        callingDescriptor: 'UNKNOWN',
        params: {
          namespace: '',
          classname: 'R_SyllabusPublicPageController',
          method: 'getSyllabusRecords',
          params: {
            action: {
              lang: 'ja',
              keyword: code,
              faculty: null,
              year,
              term: null,
              week: [],
              period: [],
              professionalCareer: null,
              subject1: null,
              limits: 20,
            },
          },
          cacheable: false,
          isContinuation: false,
        },
      }],
    };
    const context = { mode: 'PROD', app: 'siteforce:communityApp', loaded: {}, dn: [], globals: {}, uad: true };

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({
        message: JSON.stringify(message),
        'aura.context': JSON.stringify(context),
        'aura.pageURI': '/syllabus/s/',
        'aura.token': 'null',
      }),
    });
    if (!res.ok) {
      return { ok: false, url: null };
    }
    const json = await res.json();
    const action = json?.actions?.[0];
    if (action?.state !== 'SUCCESS') {
      return { ok: false, url: null };
    }
    const results = action.returnValue?.returnValue?.result || [];
    // キーワード検索なので、科目名に「授業コード:」を含むものだけに絞る
    const hits = results.filter((r) => (r.R_SlCourseName__c || '').includes(`${code}:`));
    return { ok: true, url: hits.length === 1 ? recordUrl(hits[0].Id) : null };
  };

  // 予備: 検索フォームを操作する。表示直後はフォームの準備が終わっておらず「検索」を押しても
  // 反応しないことがあるため、結果が出るまで押し直す
  const searchByForm = async () => {
    const input = await waitFor(() => document.querySelector('input[name="keyword-search"]'), 15000);
    if (!input) {
      overlay.remove();
      return;
    }

    const suffix = `/${year}${code}`;
    const findLink = () => [...document.querySelectorAll('a[href*="/r-syllabus/"]')]
      .find((a) => a.pathname.endsWith(suffix));

    for (let attempt = 0; attempt < 6; attempt++) {
      const searchButton = [...document.querySelectorAll('button')].find((b) => ['検索', 'Search'].includes(b.textContent.trim()));
      if (searchButton) {
        input.focus();
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        searchButton.click();
      }
      const link = await waitFor(findLink, 2000);
      if (link) {
        go(`${link.origin}${link.pathname}?language=ja`);
        return;
      }
    }
    overlay.remove(); // 見つからないときは検索結果をそのまま表示する
  };

  (async () => {
    let result = { ok: false, url: null };
    try {
      result = await searchByApi();
    } catch (e) {
      // API が使えない → 検索フォームで探す
    }
    if (result.url) {
      go(result.url);
      return;
    }
    if (result.ok) {
      // API は動いたが 0 件や複数件 → 覆いを外し、フォームで検索した結果をそのまま見せる
      overlay.remove();
    }
    searchByForm();
  })();
})();
