// ダッシュボードのタイムライン（課題の一覧）で、選んだ課題を非表示にする。
// 隠すときは確認の画面を出し、戻すときはボタン1つで戻せる。
// 隠した課題は chrome.storage.local の hiddenTimeline に { キー: { name, course, at } } で保存する（半年たったら消す）。
// タイムラインは Moodle のスクリプトが後から描き、絞り込みや「さらに活動を表示する」で描き直すため、
// MutationObserver で追加された項目にも同じ処理をする。
(() => {
  const block = document.querySelector('.block_timeline');
  // バーがもうある（ストア版と開発用の読み込み版の両方が有効など、このスクリプトが2回動いた）なら何もしない
  if (!block || block.querySelector('.mx-tl-bar') || typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return;
  }

  const KEEP_MS = 180 * 24 * 60 * 60 * 1000;
  let hidden = {};

  // 課題の見分け方: 課題名のリンクの URL ＋ その説明（例: 「…の提出期限」）。同じ活動の「開始」「締め切り」を別々に扱える
  const keyOf = (item) => {
    const link = item.querySelector('.event-name a');
    if (!link) {
      return null;
    }
    return `${link.getAttribute('href')}|${link.getAttribute('title') || link.textContent.trim()}`;
  };

  const save = () => chrome.storage.local.set({ hiddenTimeline: hidden });

  const button = (className, text) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    return b;
  };

  // ---- 隠す前の確認の画面 ----
  const confirmHide = (name, onConfirm) => {
    const overlay = document.createElement('div');
    overlay.className = 'mx-tl-confirm-overlay';
    const panel = document.createElement('div');
    panel.className = 'mx-tl-confirm';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const message = document.createElement('p');
    message.className = 'mx-tl-confirm-message';
    message.textContent = `「${name}」をタイムラインから非表示にしますか？`;
    const note = document.createElement('p');
    note.className = 'mx-tl-confirm-note';
    note.textContent = 'タイムラインの一番下の「すべて元に戻す」から、いつでも戻せます。';
    const cancel = button('mx-tl-confirm-cancel', 'キャンセル');
    const ok = button('mx-tl-confirm-ok', '非表示にする');
    const actions = document.createElement('div');
    actions.className = 'mx-tl-confirm-actions';
    actions.append(cancel, ok);
    panel.append(message, note, actions);
    overlay.append(panel);
    document.body.append(overlay);
    ok.focus();

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close();
      }
    });
    ok.addEventListener('click', () => {
      close();
      onConfirm();
    });
  };

  // ---- タイムラインの一番下: 「非表示にした課題: N 件 [すべて元に戻す] [個別に選ぶ]」 ----
  const bar = document.createElement('div');
  bar.className = 'mx-tl-bar';
  const barText = document.createElement('span');
  const restoreAll = button('mx-tl-bar-restore', 'すべて元に戻す');
  const barToggle = button('mx-tl-bar-toggle', '個別に選ぶ');
  bar.append(barText, restoreAll, barToggle);
  restoreAll.addEventListener('click', () => {
    // いまタイムラインに出ている、隠した課題をまとめて戻す（ボタン1つ）
    for (const item of block.querySelectorAll('[data-region="event-list-item"].mx-tl-hidden')) {
      delete hidden[keyOf(item)];
    }
    block.classList.remove('mx-tl-show-hidden');
    save();
    render();
  });
  barToggle.addEventListener('click', () => {
    block.classList.toggle('mx-tl-show-hidden');
    render();
  });
  (block.querySelector('.card-body') || block).append(bar);

  const render = () => {
    const items = [...block.querySelectorAll('[data-region="event-list-item"]')];
    let count = 0;
    for (const item of items) {
      const key = keyOf(item);
      if (!key) {
        continue;
      }
      const isHidden = !!hidden[key];
      item.classList.toggle('mx-tl-hidden', isHidden);
      count += isHidden ? 1 : 0;

      let btn = item.querySelector('.mx-tl-hide');
      if (!btn) {
        btn = button('mx-tl-hide', '');
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const k = keyOf(item);
          if (hidden[k]) {
            // 戻すときは確認なしで、ボタン1つで戻す
            delete hidden[k];
            save();
            render();
            return;
          }
          const link = item.querySelector('.event-name a');
          const name = link ? link.textContent.trim() : 'この課題';
          confirmHide(name, () => {
            const course = item.querySelector('.event-name-container > small');
            hidden[k] = {
              name,
              course: course ? course.textContent.trim().split('·').pop().trim() : '',
              at: Date.now(),
            };
            save();
            render();
          });
        });
        item.append(btn);
      }
      setText(btn, isHidden ? '元に戻す' : '非表示');
      btn.title = isHidden ? 'この課題をタイムラインに戻す' : 'この課題をタイムラインに表示しない';
    }

    // 日付の見出しのすぐ後の一覧（.list-group）の課題がすべて隠れていたら、見出しにも印を付ける
    for (const date of block.querySelectorAll('[data-region="event-list-content-date"]')) {
      const list = date.nextElementSibling;
      const listItems = list ? [...list.querySelectorAll('[data-region="event-list-item"]')] : [];
      const allHidden = listItems.length > 0 && listItems.every((i) => i.classList.contains('mx-tl-hidden'));
      date.classList.toggle('mx-tl-date-hidden', allHidden);
    }

    if (count === 0) {
      block.classList.remove('mx-tl-show-hidden');
    }
    bar.hidden = count === 0;
    setText(barText, `非表示にした課題: ${count} 件`);
    setText(barToggle, block.classList.contains('mx-tl-show-hidden') ? '選び終わる' : '個別に選ぶ');
  };

  // 文字が変わるときだけ書き換える（不要な DOM の変更で MutationObserver が反応し続けないように）
  function setText(node, text) {
    if (node.textContent !== text) {
      node.textContent = text;
    }
  }

  chrome.storage.local.get('hiddenTimeline', (data) => {
    hidden = (data && data.hiddenTimeline) || {};
    // 半年以上前に隠したものは消す（締め切りが過ぎてタイムラインに出なくなった課題の記録がたまらないように）
    const now = Date.now();
    let changed = false;
    for (const [key, value] of Object.entries(hidden)) {
      if (!value || now - (value.at || 0) > KEEP_MS) {
        delete hidden[key];
        changed = true;
      }
    }
    if (changed) {
      save();
    }
    render();

    let scheduled = false;
    new MutationObserver((mutations) => {
      // 自分で付けたボタンやバー（とその中身）の変更には反応しない
      const ours = (node) => node.nodeType === 1
        ? !!node.closest('.mx-tl-hide, .mx-tl-bar')
        : !!(node.parentElement && node.parentElement.closest('.mx-tl-hide, .mx-tl-bar'));
      if (scheduled || mutations.every((m) => ours(m.target) || [...m.addedNodes].every(ours))) {
        return;
      }
      // 画面に描かれる前（同じタスクの終わり）に隠し直し、隠した課題が一瞬見えないようにする
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        render();
      });
    }).observe(block, { childList: true, subtree: true });
  });
})();
