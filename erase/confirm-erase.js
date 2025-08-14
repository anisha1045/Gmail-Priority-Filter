
// Confirm Erase Button
document.getElementById('confirm-erase-btn').addEventListener('click', () => {
    console.log("User confirmed data erase.");
    chrome.runtime.sendMessage({ type: 'eraseData'}, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Message failed:", chrome.runtime.lastError.message);
          return;
        }
        // Handle the response here
        if (window.opener && response.success) {
            document.body.innerHTML = `
            <div class="container">
                <h2>Data Erased</h2>
                <p>Your data has been successfully erased.</p>
            </div>
            `;
            setTimeout(() => window.close(), 2000); // Close after 2 seconds
        } else 
        {
          alert(`Something went wrong. Please try again.`);
        }
      });
});

// Cancel Erase Button
document.getElementById('cancel-erase-btn').addEventListener('click', () => {
    console.log("User canceled data erase.");
    window.close();
});
