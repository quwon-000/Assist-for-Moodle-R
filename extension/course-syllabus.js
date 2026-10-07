// コースページの見出しの横に、その授業のシラバスを開くボタンを表示する。
(() => {
  // 言語を日本語に固定して開く（検索フォームを自動操作するときに、ボタン名などが変わらないように）
  const SEARCH_URL = 'https://syllabus.ritsumei.ac.jp/syllabus/s/?language=ja';

  // 年度は4月始まり（1〜3月は前年度）
  const now = new Date();
  const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();

  const courseId = new URLSearchParams(location.search).get('id');
  const heading = document.querySelector('#page-header h1') || document.querySelector('h1');

  const codesFromText = (text) => [...new Set([...(text || '').matchAll(/(\d{5}):/g)].map((m) => m[1]))];

  // 見出しの下のボタン並び。materials-download.js が先に作っていることがある
  // （storage の読み込みを待つ間に、そちらのボタンが置かれるため）ので、あればそれを使う
  const barOf = () => {
    const existing = document.querySelector('.mx-course-syllabus');
    if (existing) {
      return existing;
    }
    const bar = document.createElement('div');
    bar.className = 'mx-course-syllabus';
    // 見出しの下に置く。見出しが見つからなければ本文の先頭に置く
    const context = heading && heading.closest('.page-context-header');
    if (context) {
      context.after(bar);
    } else if (heading) {
      heading.after(bar);
    } else {
      document.querySelector('#region-main')?.prepend(bar);
    }
    return bar;
  };

  const render = (codes, syllabusUrls) => {
    if (codes.length === 0 || document.querySelector('.mx-syllabus-link')) {
      return;
    }

    const buttons = [];
    for (const code of codes) {
      const key = `${year}${code}`;
      const btn = document.createElement('a');
      btn.className = 'mx-course-syllabus-btn mx-syllabus-link';
      btn.href = syllabusUrls[key] || `${SEARCH_URL}#mx-syllabus=${code}&year=${year}`;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.title = `${code} のシラバスを新しいタブで開く`;
      btn.textContent = codes.length > 1 ? ` シラバス（${code}）` : ' シラバス';
      buttons.push(btn);
    }

    // シラバスのボタンは並びの先頭に置く
    barOf().prepend(...buttons);
  };

  const textCodes = codesFromText(heading && heading.textContent);
  const titleCodes = textCodes.length > 0 ? textCodes : codesFromText(document.title);

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    render(titleCodes, {});
    return;
  }

  chrome.storage.local.get(['courseCodes', 'syllabusUrls'], (data) => {
    const remembered = (data && data.courseCodes && data.courseCodes[courseId]) || [];
    const codes = titleCodes.length > 0 ? titleCodes : remembered;
    render(codes, (data && data.syllabusUrls) || {});
  });
})();
