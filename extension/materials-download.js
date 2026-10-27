// コースページの教材を一覧から選んで一括ダウンロードする。
// 対象: 「ファイル」（mod/resource）、「フォルダ」（mod/folder）の中のファイル、説明文や「ページ」（mod/page）の中の pluginfile.php へのリンク、
//       「課題」（mod/assign）に先生が添付した資料（提出ファイル・フィードバックは除く）。
// コースページに並ぶ教材に加え、「第1回」などの回ごとのページ（course/section.php）の教材も集める。
// 保存そのものは background.js が chrome.downloads で行う。
(() => {
  const content = document.querySelector('.course-content');
  // ボタンがもうある（ストア版と開発用の読み込み版の両方が有効など、このスクリプトが2回動いた）なら何もしない
  if (!content || document.querySelector('.mx-dl-open')) {
    return;
  }

  const heading = document.querySelector('#page-header h1') || document.querySelector('h1');
  const courseName = (heading && heading.textContent.trim()) || document.title.split('|')[0].trim() || 'course';
  // 表示用。実際の保存では background.js が同じ規則で使えない文字を置き換える
  const toFolderName = (name) => name.replace(/[\\/:*?"<>|]/g, '_');
  const courseFolder = toFolderName(courseName);

  // 選んだ教材それぞれの保存先フォルダ（「ダウンロード」フォルダからの並び）。
  // make が false ならフォルダを作らない。sectionFolder(回の名前) は回のフォルダの名前（null なら回のフォルダを作らない）
  //   1件だけ:                     フォルダを作らない          → ダウンロード/<ファイル>
  //   2件以上・同じ回だけ（回のフォルダを作る）: 科目名は付けない → ダウンロード/<回>/[<フォルダ教材>/]<ファイル>
  //   それ以外:                    科目名の下に（回ごとに）    → ダウンロード/<科目>/[<回>/][<フォルダ教材>/]<ファイル>
  const sameSectionOf = (chosen) => new Set(chosen.map((item) => item.section)).size === 1;
  const topKindOf = (chosen, make, sectionFolder) => {
    if (!make || chosen.length <= 1) {
      return null;
    }
    return sameSectionOf(chosen) && sectionFolder(chosen[0].section) !== null ? 'section' : 'course';
  };
  const folderPathsOf = (chosen, make, sectionFolder) => {
    const kind = topKindOf(chosen, make, sectionFolder);
    return chosen.map((item) => {
      if (!kind) {
        return [];
      }
      const folder = sectionFolder(item.section);
      const inSection = [...(folder !== null ? [folder] : []), ...(item.subdir || [])];
      return kind === 'section' ? inSection : [courseName, ...inSection];
    });
  };

  const sectionNameOf = (el) => {
    const section = el.closest('li.section');
    if (!section) {
      return 'その他';
    }
    const name = section.querySelector('.sectionname');
    return (name && name.textContent.trim()) || `セクション${section.dataset.number || ''}`;
  };

  // 教材名（data-activityname があればそれ、なければ非表示ラベル「ファイル」などを除いた表示名）
  const activityNameOf = (activity, link) => {
    const item = activity.querySelector('[data-activityname]');
    if (item && item.dataset.activityname) {
      return item.dataset.activityname.trim();
    }
    const name = link.querySelector('.instancename');
    if (!name) {
      return link.textContent.trim();
    }
    const copy = name.cloneNode(true);
    copy.querySelectorAll('.accesshide').forEach((el) => el.remove());
    return copy.textContent.trim();
  };

  const fileNameOfUrl = (url) => {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').pop()) || url;
    } catch (e) {
      return url;
    }
  };

  // 同じサイトのページを取得して DOM にする（ログイン状態のまま取得できる）
  const fetchDoc = async (url) => {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  };

  // ---- 教材を集める ----
  // 対象はコースページ自体と、その先の回ごとのページ（course/section.php など）。
  const collect = async (onStatus) => {
    const items = [];
    const seen = new Set();
    // 同じファイルかどうかは forcedownload の有無を無視して判定する
    const keyOf = (url) => {
      const u = new URL(url);
      u.searchParams.delete('forcedownload');
      return u.href;
    };
    // item.at = 今のページ（コースページ）上でその教材の位置を表す要素。並び順に使う
    // item.subdir = 回のフォルダの下にさらに作るフォルダ（フォルダ教材の名前とその中のサブフォルダ）
    const add = (item) => {
      const key = keyOf(item.url);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    };
    const abs = (link, baseUrl) => new URL(link.getAttribute('href'), baseUrl).href;

    // フォルダ内ファイルの URL（…/mod_folder/content/<版>/<サブフォルダ>/<ファイル名>）からサブフォルダを取り出す
    const folderSubdirsOf = (url) => {
      const m = new URL(url).pathname.match(/\/mod_folder\/content\/\d+\/(.*)$/);
      if (!m) {
        return [];
      }
      return m[1].split('/').slice(0, -1).filter(Boolean).map((s) => {
        try {
          return decodeURIComponent(s);
        } catch (e) {
          return s;
        }
      });
    };

    // root の中の教材を拾う。ctx = { baseUrl, at(el), section(el) }
    //   コースページ: at = 教材そのもの、section = その教材のセクション名
    //   回のページ:   at = コースページ上のその回のリンク、section = その回の名前
    const scanRoot = async (root, ctx) => {
      // ファイル（リソース）: redirect=1 で表示設定に関係なくファイル本体へ転送される
      for (const activity of root.querySelectorAll('li.activity.modtype_resource')) {
        const link = activity.querySelector('a.aalink[href*="/mod/resource/view.php"]');
        if (!link) {
          continue; // 閲覧制限などでリンクがない
        }
        const url = new URL(abs(link, ctx.baseUrl));
        url.searchParams.set('redirect', '1');
        add({ kind: 'ファイル', name: activityNameOf(activity, link), section: ctx.section(activity), url: url.href, at: ctx.at(activity) });
      }

      // フォルダ: 中のファイルを1つずつ。保存先は <回>/<フォルダ名>/<サブフォルダ>/ でフォルダの構造を保つ
      //   コースページ上に中身を表示する設定のフォルダはそのリンクを使い、そうでなければフォルダのページを取得する
      for (const activity of root.querySelectorAll('li.activity.modtype_folder')) {
        const link = activity.querySelector('a.aalink[href*="/mod/folder/view.php"]');
        const folderName = link ? activityNameOf(activity, link)
          : (activity.querySelector('[data-activityname]')?.dataset.activityname || 'フォルダ').trim();
        let files = [...activity.querySelectorAll('a[href*="/mod_folder/content/"]')].map((a) => abs(a, ctx.baseUrl));
        let texts = [...activity.querySelectorAll('a[href*="/mod_folder/content/"]')].map((a) => a.textContent.trim());
        if (files.length === 0 && link) {
          const folderUrl = abs(link, ctx.baseUrl);
          onStatus(`フォルダ「${folderName}」を調べています…`);
          try {
            const doc = await fetchDoc(folderUrl);
            const anchors = [...(doc.querySelector('#region-main') || doc.body).querySelectorAll('a[href*="/mod_folder/content/"]')];
            files = anchors.map((a) => abs(a, folderUrl));
            texts = anchors.map((a) => a.textContent.trim());
          } catch (e) {
            // 取得できなかったフォルダは飛ばす
          }
        }
        files.forEach((url, i) => {
          const subdirs = folderSubdirsOf(url);
          const fileName = texts[i] || fileNameOfUrl(url);
          add({
            kind: `フォルダ「${folderName}」`,
            name: subdirs.length > 0 ? `${subdirs.join('/')}/${fileName}` : fileName,
            section: ctx.section(activity),
            subdir: [folderName, ...subdirs],
            url,
            at: ctx.at(activity),
          });
        });
      }

      // 説明文・ラベルに貼られたファイル
      for (const link of root.querySelectorAll('a[href*="/pluginfile.php/"]')) {
        const url = abs(link, ctx.baseUrl);
        add({ kind: '添付', name: link.textContent.trim() || fileNameOfUrl(url), section: ctx.section(link), url, at: ctx.at(link) });
      }

      // 「ページ」の本文に貼られたファイル（各ページを取得して探す）
      for (const activity of root.querySelectorAll('li.activity.modtype_page')) {
        const link = activity.querySelector('a.aalink[href*="/mod/page/view.php"]');
        if (!link) {
          continue;
        }
        const pageUrl = abs(link, ctx.baseUrl);
        const pageName = activityNameOf(activity, link);
        onStatus(`「${pageName}」のページを調べています…`);
        try {
          const doc = await fetchDoc(pageUrl);
          const main = doc.querySelector('#region-main') || doc.body;
          for (const a of main.querySelectorAll('a[href*="/pluginfile.php/"]')) {
            const url = abs(a, pageUrl);
            add({ kind: `添付（${pageName}）`, name: a.textContent.trim() || fileNameOfUrl(url), section: ctx.section(activity), url, at: ctx.at(activity) });
          }
        } catch (e) {
          // 取得できなかったページは飛ばす
        }
      }

      // 「課題」に先生が添付した資料（各課題のページを取得して探す）
      //   対象は mod_assign の introattachment（追加ファイル）と intro（説明文に貼られたファイル）だけ。
      //   同じページに出る、自分が提出したファイル（assignsubmission_*）と
      //   フィードバックのファイル（assignfeedback_*）は資料ではないので集めない
      for (const activity of root.querySelectorAll('li.activity.modtype_assign')) {
        const link = activity.querySelector('a.aalink[href*="/mod/assign/view.php"]');
        if (!link) {
          continue;
        }
        const assignUrl = abs(link, ctx.baseUrl);
        const assignName = activityNameOf(activity, link);
        const collectAssignFiles = (main, baseUrl) => {
          for (const a of main.querySelectorAll('a[href*="/pluginfile.php/"]')) {
            const url = abs(a, baseUrl);
            if (!/\/mod_assign\/(introattachment|intro|activityattachment)\//.test(new URL(url).pathname)) {
              continue;
            }
            add({ kind: `課題「${assignName}」の資料`, name: a.textContent.trim() || fileNameOfUrl(url), section: ctx.section(activity), url, at: ctx.at(activity) });
          }
        };
        onStatus(`課題「${assignName}」を調べています…`);
        try {
          const doc = await fetchDoc(assignUrl);
          const main = doc.querySelector('#region-main') || doc.body;
          collectAssignFiles(main, assignUrl);

          // 提出画面（action=editsubmission）にだけ出る資料もある
          //   - 「提出中のみファイルを表示する」設定の課題の追加ファイル（introattachment）
          //   - 「活動の指示」に貼られたファイル（activityattachment）
          // 提出を受け付けている（課題のページに「提出を追加／編集」がある）ときだけ開く。
          // 開いても提出の記録は作られず、状態も変わらない（先生のログに「提出フォームを表示」が残る）。
          // 時間制限付きの課題のタイマーを始める begin=1 は付けない。
          const canSubmit = main.querySelector('a[href*="action=editsubmission"], input[name="action"][value="editsubmission"]');
          if (canSubmit) {
            const editUrl = new URL(assignUrl);
            editUrl.searchParams.set('action', 'editsubmission');
            editUrl.searchParams.delete('begin');
            onStatus(`課題「${assignName}」の提出画面を調べています…`);
            const editDoc = await fetchDoc(editUrl.href);
            collectAssignFiles(editDoc.querySelector('#region-main') || editDoc.body, editUrl.href);
          }
        } catch (e) {
          // 取得できなかった課題は飛ばす
        }
      }
    };

    // 1. コースページに表示されている教材
    await scanRoot(content, { baseUrl: location.href, at: (e) => e, section: sectionNameOf });

    // 2. 回ごとのページ（コースページには「第1回」などのリンクだけがある形式）
    const sectionLinks = [];
    const sectionUrls = new Set();
    for (const link of content.querySelectorAll('a[href*="/course/section.php"], a[href*="/course/view.php"][href*="section="]')) {
      const url = abs(link, location.href);
      const section = link.closest('li.section');
      // その回の教材がすでにコースページ上に出ているなら取得しない
      if (sectionUrls.has(url) || (section && section.querySelector('li.activity'))) {
        continue;
      }
      sectionUrls.add(url);
      sectionLinks.push({ link, url });
    }

    let checked = 0;
    for (const { link, url } of sectionLinks) {
      const linkName = link.textContent.trim() || sectionNameOf(link);
      onStatus(`${linkName} のページを調べています…（${checked + 1} / ${sectionLinks.length}）`);
      try {
        const doc = await fetchDoc(url);
        const root = doc.querySelector('.course-content') || doc.querySelector('#region-main') || doc.body;
        const pageSectionName = doc.querySelector('.course-content .sectionname');
        const name = (pageSectionName && pageSectionName.textContent.trim()) || linkName;
        await scanRoot(root, { baseUrl: url, at: () => link, section: () => name });
      } catch (e) {
        // 取得できなかった回は飛ばす
      }
      checked += 1;
    }

    // コースページ上の並び順に揃える（同じ回の教材がまとまるように）。同じ at どうしは見つけた順のまま
    items.sort((a, b) => (a.at === b.at ? 0 : a.at.compareDocumentPosition(b.at) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return items;
  };

  // ---- 画面 ----
  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  const openDialog = async () => {
    if (document.querySelector('.mx-dl-overlay')) {
      return;
    }
    const status = el('p', { className: 'mx-dl-status', textContent: '教材を集めています…' });
    const list = el('div', { className: 'mx-dl-list' });
    const count = el('span', { className: 'mx-dl-count' });
    const dest = el('p', { className: 'mx-dl-dest', textContent: `保存先: ダウンロード/${courseFolder}/<回の名前>/` });
    const downloadBtn = el('button', { type: 'button', className: 'mx-dl-primary', textContent: 'ダウンロード', disabled: true });
    const closeBtn = el('button', { type: 'button', className: 'mx-dl-secondary', textContent: '閉じる' });
    const cancelBtn = el('button', { type: 'button', className: 'mx-dl-link', textContent: 'ダウンロードを中止', hidden: true });
    const hint = el('p', { className: 'mx-dl-hint', hidden: true,
      textContent: 'このダイアログを閉じても、ページを移動しても、保存は続きます。残りの件数はブラウザの拡張機能アイコンに表示されます。' });
    const allBtn = el('button', { type: 'button', className: 'mx-dl-link', textContent: 'すべて選択' });
    const noneBtn = el('button', { type: 'button', className: 'mx-dl-link', textContent: 'すべて解除' });

    // 名前の欄の横の「フォルダ」のチェックボックス: 外すと回の見出しのチェックもすべて外し、
    // フォルダを1つも作らず、すべて「ダウンロード」に直接保存する。
    // 選んだ状態は storage の downloadOptions に保存し、次回も同じ状態で開く
    const makeBox = el('input', { type: 'checkbox', checked: true, className: 'mx-dl-make-folder' });
    makeBox.setAttribute('aria-label', 'フォルダを作る');
    const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    const saveOptions = () => {
      if (hasStorage) {
        chrome.storage.local.set({ downloadOptions: { makeFolder: makeBox.checked } });
      }
    };

    // 「ダウンロード」の直下に作るフォルダの名前（科目のフォルダ、または回のフォルダ）を変えられる。
    // 科目のフォルダの名前は storage の folderNames に科目ごとに保存し、次回も使う
    const courseId = new URLSearchParams(location.search).get('id') || courseName;
    let savedCourseFolder = '';
    let folderEdited = false;
    let lastKind = null;
    const folderInput = el('input', { type: 'text', className: 'mx-dl-folder-input' });
    folderInput.setAttribute('aria-label', '保存するフォルダの名前');
    const folderRow = el('div', { className: 'mx-dl-folder' }, [
      el('label', { title: 'チェックを外すと、フォルダを作らずに「ダウンロード」へ直接保存します' }, [makeBox, el('span', { textContent: 'フォルダ' })]),
      folderInput,
    ]);
    // 欄には実際に保存される名前（使えない文字を _ にしたもの）を出す。回のフォルダは、回の見出しの欄の名前を使う
    const defaultFolderOf = (kind, chosen) => toFolderName(kind === 'section'
      ? sectionFolder(chosen[0].section) || chosen[0].section
      : (savedCourseFolder || courseName));

    const panel = el('div', { className: 'mx-dl-panel', role: 'dialog', ariaModal: 'true', ariaLabel: '教材の一括ダウンロード' }, [
      el('h2', { className: 'mx-dl-title', textContent: '教材の一括ダウンロード' }),
      dest,
      folderRow,
      el('div', { className: 'mx-dl-tools' }, [allBtn, noneBtn, count]),
      list,
      status,
      hint,
      el('div', { className: 'mx-dl-actions' }, [cancelBtn, closeBtn, downloadBtn]),
    ]);
    const overlay = el('div', { className: 'mx-dl-overlay' }, [panel]);
    document.body.append(overlay);

    let port = null;
    const close = () => {
      if (port) {
        port.disconnect(); // 閉じても保存は background.js で続く（進み具合が届かなくなるだけ）
      }
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close();
      }
    });

    const items = await collect((text) => {
      status.textContent = text;
    });
    if (items.length === 0) {
      status.textContent = 'このページにはダウンロードできる教材がありません。';
      return;
    }

    // セクションごとに並べる。回の見出しのチェックボックスは「その回のフォルダを作るか」。
    // 外しても教材の選択は変わらない。入れると、その回の教材にもチェックを入れる
    const boxes = [];
    const sectionBoxes = [];
    const sectionBoxOf = new Map();
    // 回のフォルダの名前の欄（回の見出しに置く）。名前は storage の sectionFolderNames に科目ごと・回ごとに保存し、次回も使う
    const sectionNameInputs = [];
    let lastSection = null;
    let groupBox = null;
    for (const item of items) {
      if (item.section !== lastSection) {
        groupBox = el('input', { type: 'checkbox', checked: true, className: 'mx-dl-section-box' });
        groupBox.setAttribute('aria-label', `${item.section} のフォルダを作る`);
        groupBox.members = [];
        groupBox.title = 'チェックを外すと、この回のフォルダを作りません';
        sectionBoxes.push(groupBox);
        sectionBoxOf.set(item.section, groupBox);
        const nameInput = el('input', { type: 'text', className: 'mx-dl-section-name', value: toFolderName(item.section) });
        nameInput.section = item.section;
        nameInput.title = 'この回のフォルダの名前（変えられます）';
        nameInput.setAttribute('aria-label', `${item.section} のフォルダの名前`);
        groupBox.nameInput = nameInput;
        sectionNameInputs.push(nameInput);
        list.append(el('h3', { className: 'mx-dl-section' }, [el('label', {}, [groupBox]), nameInput]));
        lastSection = item.section;
      }
      const box = el('input', { type: 'checkbox', checked: true });
      box.item = item;
      groupBox.members.push(box);
      boxes.push(box);
      list.append(el('label', { className: 'mx-dl-item' }, [
        box,
        el('span', { className: 'mx-dl-name', textContent: item.name }),
        el('span', { className: 'mx-dl-kind', textContent: item.kind }),
      ]));
    }

    // 回のフォルダの名前（見出しのチェックが外れていれば null = 回のフォルダを作らない。欄が空なら元の回の名前）
    const sectionFolder = (section) => {
      const box = sectionBoxOf.get(section);
      if (!box) {
        return section;
      }
      return box.checked ? (box.nameInput.value.trim() || section) : null;
    };

    const refresh = () => {
      const chosen = boxes.filter((b) => b.checked).map((b) => b.item);
      const n = chosen.length;
      count.textContent = `${n} / ${boxes.length} 件を選択`;
      downloadBtn.disabled = n === 0;

      // フォルダ名の欄: 一番上のフォルダが1つに決まるときだけ使える。種類が変わったら既定の名前に戻す
      const make = makeBox.checked;
      const kind = topKindOf(chosen, make, sectionFolder);
      folderInput.disabled = !kind;
      sectionBoxes.forEach((b) => { b.nameInput.disabled = !b.checked; });
      if (!kind) {
        folderInput.value = '';
        folderInput.placeholder = make
          ? '（1件だけのときはフォルダを作りません）'
          : '（フォルダを作りません）';
      } else if (!folderEdited || kind !== lastKind) {
        folderInput.value = defaultFolderOf(kind, chosen);
        folderEdited = false;
      }
      lastKind = kind;

      // 保存先の表示: 作られるフォルダを並べて見せる
      if (!kind) {
        dest.textContent = '保存先: ダウンロード/（フォルダは作りません）';
        return;
      }
      const name = toFolderName(folderInput.value.trim() || defaultFolderOf(kind, chosen));
      const withSection = kind === 'course' && chosen.some((item) => sectionFolder(item.section) !== null);
      dest.textContent = withSection
        ? `保存先: ダウンロード/${name}/<回の名前>/`
        : `保存先: ダウンロード/${name}/`;
    };
    list.addEventListener('change', (e) => {
      // 回の見出しにチェックを入れたら、その回の教材にもチェックを入れ、フォルダを作る状態にする（外したときは教材はそのまま）
      if (e.target.classList && e.target.classList.contains('mx-dl-section-box') && e.target.checked) {
        e.target.members.forEach((b) => { b.checked = true; });
        if (!makeBox.checked) {
          makeBox.checked = true;
          saveOptions();
        }
      }
      refresh();
    });
    // 回のフォルダの名前を変えたら、保存先の表示（同じ回だけのときは上の欄）も合わせる
    list.addEventListener('input', refresh);
    folderInput.addEventListener('input', () => {
      folderEdited = true;
      refresh();
    });
    // 「フォルダ」のチェック: 外すと回の見出しのチェックをすべて外し、入れるとすべて入れる
    const setSections = (on) => sectionBoxes.forEach((b) => { b.checked = on; });
    makeBox.addEventListener('change', () => {
      setSections(makeBox.checked);
      saveOptions();
      refresh();
    });
    if (hasStorage) {
      chrome.storage.local.get(['downloadOptions', 'folderNames', 'sectionFolderNames'], (data) => {
        const saved = (data && data.downloadOptions) || {};
        // 以前の版の設定を引き継ぐ: 「フォルダを作らずに保存する」（flat）がオン、
        // または作るフォルダを1つも選んでいなかった人は、フォルダを作らない状態にする
        const legacyNone = saved.flat === true
          || (saved.course === false && saved.section === false && saved.folder === false);
        makeBox.checked = saved.makeFolder ?? !legacyNone;
        setSections(makeBox.checked);
        savedCourseFolder = ((data && data.folderNames) || {})[courseId] || '';
        const savedSections = ((data && data.sectionFolderNames) || {})[courseId] || {};
        sectionNameInputs.forEach((input) => {
          if (savedSections[input.section]) {
            input.value = savedSections[input.section];
          }
        });
        lastKind = null; // 保存してあった科目のフォルダ名を入れ直す
        refresh();
      });
    }
    // 「すべて選択」「すべて解除」は回の見出しのチェック（回のフォルダ）も一緒に切り替える
    allBtn.addEventListener('click', () => {
      boxes.forEach((b) => { b.checked = true; });
      setSections(true);
      if (!makeBox.checked) {
        makeBox.checked = true;
        saveOptions();
      }
      refresh();
    });
    noneBtn.addEventListener('click', () => {
      boxes.forEach((b) => { b.checked = false; });
      setSections(false);
      refresh();
    });
    status.textContent = '';
    refresh();

    downloadBtn.addEventListener('click', () => {
      const chosen = boxes.filter((b) => b.checked).map((b) => b.item);
      const make = makeBox.checked;
      const kind = topKindOf(chosen, make, sectionFolder);
      let folders = folderPathsOf(chosen, make, sectionFolder);
      // 一番上のフォルダ（科目または回）の名前を、入力された名前にする
      const topName = folderInput.value.trim();
      if (kind && topName) {
        folders = folders.map((f) => (f.length > 0 ? [topName, ...f.slice(1)] : f));
        if (kind === 'course' && hasStorage) {
          chrome.storage.local.get('folderNames', (data) => {
            const names = (data && data.folderNames) || {};
            if (topName === courseFolder) {
              delete names[courseId]; // 既定の名前に戻したら記録を消す
            } else {
              names[courseId] = topName;
            }
            chrome.storage.local.set({ folderNames: names });
          });
        }
      }
      // 回のフォルダの名前を科目ごとに覚える（既定の名前のままの回は記録しない）
      if (hasStorage) {
        chrome.storage.local.get('sectionFolderNames', (data) => {
          const all = (data && data.sectionFolderNames) || {};
          const names = {};
          sectionNameInputs.forEach((input) => {
            const value = input.value.trim();
            if (value && value !== toFolderName(input.section)) {
              names[input.section] = value;
            }
          });
          if (Object.keys(names).length > 0) {
            all[courseId] = names;
          } else {
            delete all[courseId];
          }
          chrome.storage.local.set({ sectionFolderNames: all });
        });
      }
      const selected = chosen.map((item, i) => ({ name: item.name, url: item.url, folders: folders[i] }));
      [...boxes, ...sectionBoxes, ...sectionNameInputs].forEach((b) => { b.disabled = true; });
      [downloadBtn, allBtn, noneBtn, makeBox, folderInput].forEach((b) => { b.disabled = true; });
      closeBtn.textContent = '閉じる（保存は続きます）';
      cancelBtn.hidden = false;
      hint.hidden = false;
      status.textContent = `0 / ${selected.length} 件完了`;

      const finish = () => {
        cancelBtn.hidden = true;
        hint.hidden = true;
        closeBtn.textContent = '閉じる';
        port.disconnect();
        port = null;
      };

      port = chrome.runtime.connect({ name: 'materials-download' });
      port.onMessage.addListener((msg) => {
        const failedText = msg.failed.length > 0 ? `（失敗: ${msg.failed.join('、')}）` : '';
        if (msg.type === 'cancelled') {
          status.textContent = `中止しました（${msg.done} / ${msg.total} 件を保存済み。保存中だった教材は最後まで保存されます）${failedText}`;
          finish();
          return;
        }
        status.textContent = `${msg.done} / ${msg.total} 件完了${failedText}`;
        if (msg.type === 'done') {
          status.textContent = (msg.failed.length === 0 ? 'すべて保存しました。' : '保存が終わりました。') + status.textContent;
          if (msg.failed.length > 0) {
            status.textContent += ' ログインが切れていることがあります。ページを再読み込みしてから、失敗した教材をもう一度試してください。';
          }
          finish();
        }
      });
      cancelBtn.addEventListener('click', () => {
        cancelBtn.disabled = true;
        status.textContent = '中止しています…';
        port?.postMessage({ type: 'cancel' });
      });
      port.postMessage({ type: 'start', items: selected });
    });
  };

  // ---- 見出しの下のボタン並びに追加 ----
  let bar = document.querySelector('.mx-course-syllabus');
  if (!bar) {
    bar = el('div', { className: 'mx-course-syllabus' });
    const context = heading && heading.closest('.page-context-header');
    if (context) {
      context.after(bar);
    } else if (heading) {
      heading.after(bar);
    } else {
      document.querySelector('#region-main')?.prepend(bar);
    }
  }
  const button = el('button', { type: 'button', className: 'mx-course-syllabus-btn mx-dl-open', textContent: '教材を一括ダウンロード' });
  button.addEventListener('click', openDialog);
  bar.append(button);
})();
