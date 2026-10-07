// ダッシュボード / コースページのレイアウト（標準 ⇄ ワイド）を切り替える。
// document_start で実行し、<html> に属性を付けて CSS 側の有効・無効を切り替える。
//   ダッシュボード: html[data-mx-dashboard="wide" | "default"]
//   コースページ:   html[data-mx-course="grid" | "default"]
// 選んだレイアウトは chrome.storage.local の layout に保存する。
(() => {
  const page = location.pathname.startsWith('/course/') ? 'course' : 'dashboard';
  const attr = `data-mx-${page}`;
  const twoColumn = page === 'course' ? 'grid' : 'wide';
  const root = document.documentElement;
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  const buttons = [];
  const apply = (value) => {
    root.setAttribute(attr, value);
    for (const btn of buttons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === value));
    }
  };

  // ちらつかないよう、保存値を読む前に既定（2列）を付けておく
  apply(twoColumn);
  if (hasStorage) {
    chrome.storage.local.get('layout', (data) => {
      const saved = data && data.layout && data.layout[page];
      if (saved === 'default' || saved === twoColumn) {
        apply(saved);
      }
    });
  }

  const save = (value) => {
    if (!hasStorage) {
      return;
    }
    chrome.storage.local.get('layout', (data) => {
      chrome.storage.local.set({ layout: { ...((data && data.layout) || {}), [page]: value } });
    });
  };

  const render = () => {
    const nav = document.querySelector('#usernavigation');
    if (!nav || document.querySelector('.mx-layout-toggle')) {
      return;
    }

    const group = document.createElement('div');
    group.className = 'mx-layout-toggle';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'レイアウト');

    const choices = [
      ['default', '標準', 'moodle+R の標準の表示'],
      [twoColumn, 'ワイド', '画面の幅いっぱいに2列で表示'],
    ];
    for (const [value, label, title] of choices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.value = value;
      btn.textContent = label;
      btn.title = title;
      btn.addEventListener('click', () => {
        apply(value);
        save(value);
      });
      buttons.push(btn);
      group.append(btn);
    }

    nav.prepend(group);
    apply(root.getAttribute(attr));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
