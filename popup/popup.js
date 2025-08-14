document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup script loaded");
  document.getElementById('pre-train').addEventListener('click', () => {
    console.log('Pre-Train button clicked');
    const newWindow = window.open('../pre-train/pre-train.html', 'PreTrainPopup', 'width=525,height=450');
  });

  document.getElementById('train').addEventListener('click', () => {
    console.log('Train button clicked');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'guideTrainingTasks' });
    });
  });

  document.getElementById('erase').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "eraseData" });
      });
    window.open('../erase/confirm-erase.html', 'ConfirmErasePopup', 'width=525,height=450');
  });

  document.getElementById('how-to').addEventListener('click', () => {
    console.log("HOW TO LCICKED");
    window.open('how_to.html', 'HowToPopup', 'width=525,height=450');
    // window.open("https://yourusername.github.io/repo-name/", "_blank");
  });

});


window.addEventListener('message', (event) => {
  if (event.data.type === 'oauth_success') {
    const tokens = event.data.tokens;
    console.log('Received tokens in popup page:', tokens);

    // Forward it to service worker
    chrome.runtime.sendMessage({ type: 'oauth_success', tokens });
  }
});



