/** The toolbar opens settings; activation belongs on the video player. */
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
