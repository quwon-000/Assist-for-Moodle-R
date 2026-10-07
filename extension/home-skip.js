// moodle+R を開いたときの Home（サイトのトップ）を飛ばして、ダッシュボードを開く。
// 飛ばすのは moodle+R の外から開いたとき（ブックマーク・URL の直接入力・他サイトのリンク・ログイン直後）だけ。
// moodle+R の中でナビバーの「Home」やロゴを押したとき（直前のページが moodle+R）は、そのまま Home を表示する。
(() => {
  const isHome = location.pathname === '/' || location.pathname === '/index.php';
  if (!isHome || new URLSearchParams(location.search).has('redirect')) {
    return;
  }
  let fromInside = false;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    fromInside = !!ref && ref.origin === location.origin && !ref.pathname.startsWith('/login/');
  } catch (e) {
    fromInside = false;
  }
  if (!fromInside) {
    location.replace('/my/');
  }
})();
