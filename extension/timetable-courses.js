// ダッシュボードの「My時間割」から「Moodle のコースID → 授業コード」の対応を覚えておく。
// コースページ（course-syllabus.js）で、見出しから授業コードが取れないときに使う。
(() => {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return;
  }

  const found = {};
  for (const link of document.querySelectorAll('.block_rutime_table .timetable a.active-course-name')) {
    const courseId = new URL(link.href, location.href).searchParams.get('id');
    // 例: "12345:サンプル科目A(Q) § 12346:サンプル科目B(K1)" → ["12345", "12346"]
    const codes = [...new Set([...link.textContent.matchAll(/(\d{5}):/g)].map((m) => m[1]))];
    if (courseId && codes.length > 0) {
      found[courseId] = codes;
    }
  }
  if (Object.keys(found).length === 0) {
    return;
  }

  chrome.storage.local.get('courseCodes', (data) => {
    chrome.storage.local.set({ courseCodes: { ...((data && data.courseCodes) || {}), ...found } });
  });
})();
