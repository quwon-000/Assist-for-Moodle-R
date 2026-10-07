// コースページの「私の先生にメッセージ」ブロック（右側のドロワーにあり、普段は閉じていて見えない）の
// 先生へのリンクを、コースページ上部（シラバスなどのボタンの下）にも表示する。
// ブロックは Moodle の追加プラグイン block_messageteacher（Message My Teacher）。
(() => {
  const block = document.querySelector('section.block_messageteacher')
    || [...document.querySelectorAll('section.block')].find((b) => {
      const title = b.querySelector('.card-title, h5, h3');
      return title && title.textContent.includes('先生にメッセージ');
    });
  if (!block || document.querySelector('.mx-course-teachers')) {
    return;
  }
  const originals = [...block.querySelectorAll('a.messageteacher_link, .card-text a[href], .content a[href]')]
    .filter((a, i, all) => all.indexOf(a) === i && a.textContent.trim());
  if (originals.length === 0) {
    return;
  }

  const row = document.createElement('div');
  row.className = 'mx-course-teachers';
  const label = document.createElement('span');
  label.className = 'mx-course-teachers-label';
  label.textContent = '先生にメッセージ:';
  row.append(label);

  for (const original of originals) {
    const btn = document.createElement('a');
    btn.className = 'mx-course-syllabus-btn mx-course-teacher-btn';
    btn.href = original.href;
    btn.textContent = original.textContent.trim();
    btn.title = `${btn.textContent} にメッセージを送る`;
    // プラグインのスクリプトは元のリンクにだけクリック処理（メッセージ入力画面を開く）を付けているので、
    // 元のリンクを押したことにする。スクリプトが動いていなければ、元のリンク先（送信ページ）へ移動する
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      original.click();
    });
    row.append(btn);
  }

  // シラバスなどのボタン並びの下に置く。なければ見出しの下
  const bar = document.querySelector('.mx-course-syllabus');
  const heading = document.querySelector('#page-header h1') || document.querySelector('h1');
  const context = heading && heading.closest('.page-context-header');
  if (bar) {
    bar.after(row);
  } else if (context) {
    context.after(row);
  } else if (heading) {
    heading.after(row);
  } else {
    document.querySelector('#region-main')?.prepend(row);
  }
})();
