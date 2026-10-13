// インストール直後の案内ページ: バージョンとリポジトリへのリンクを manifest から入れる。
(() => {
  const manifest = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest
    ? chrome.runtime.getManifest()
    : {};
  document.getElementById('version').textContent = manifest.version || '';

  // リポジトリの URL は manifest の homepage_url の1か所で管理する（未設定・仮の値なら出さない）
  // 使い方ガイドは、リポジトリのトップの README の「使い方」の節
  const repo = manifest.homepage_url || '';
  if (repo && !repo.includes('YOUR-GITHUB-NAME')) {
    document.getElementById('repo').href = repo;
    document.getElementById('guide').href = `${repo.replace(/\/$/, '')}#使い方`;
  } else {
    document.getElementById('repo-wrap').hidden = true;
  }
})();
