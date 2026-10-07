// ナビバーの「リンク集」（PC 用のドロップダウンと、狭い画面用の左メニューの両方）に CAMPUS WEB を追加する。
// 既存の「学び支援サイト」のリンクを複製して直後に置くので、見た目はメニューごとの既存項目と同じになる。
(() => {
  const CAMPUSWEB_URL = 'https://cw.ritsumei.ac.jp/campusweb/login.html';
  const ANCHOR_URL = 'https://www.ritsumei.ac.jp/pathways-future/'; // 学び支援サイト

  for (const anchor of document.querySelectorAll(`a[href="${ANCHOR_URL}"]`)) {
    const menu = anchor.parentElement;
    if (!menu || menu.querySelector(`a[href="${CAMPUSWEB_URL}"]`)) {
      continue;
    }
    const link = anchor.cloneNode(false);
    link.removeAttribute('id');
    link.href = CAMPUSWEB_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'CAMPUS WEB';
    anchor.after(link);
  }
})();
