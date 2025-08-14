

let labelMode = false;
let count = 0;
let observer = null;
let firstTrain = true;
let emailCount = -1;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'guideTrainingTasks') {
    // Initialize the script
    window.location.href = "https://mail.google.com/mail/u/0/#search/in:all+-is:unread";
    // goToAllMail();
    count = 0;
    sessionStorage.clear();
    console.log("SESSION STORAGE CLEARED");
    observeGmailUpdates();
    askForCount();
  }
});

/* Create a small container with text asking the user for the email count they
 would like to input. */ 
function askForCount() {
  let container = document.querySelector('div[style*="position: fixed"]');
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
  }
  container.style.position = 'fixed';
  container.style.top = '10px';
  container.style.right = '70px';
  container.style.backgroundColor = 'white';
  container.style.padding = '10px';  // Reduced padding
  container.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
  container.style.zIndex = '9999';
  container.style.width = '400px';  // Set fixed width for the box
  container.style.height = '50px';  // Allow height to grow as needed
  container.style.display = 'flex';
  container.style.flexDirection = 'column';  // Stack content vertically
  container.style.alignItems = 'center';  // Center content horizontally
  container.style.borderRadius = '10px';

    // Add input field and button to the container
    container.innerHTML = `
    <div>
      <label for="emailCount">Enter the number of emails to submit for labeling:</label>
      <div style="margin-bottom: 5px;"></div>
      <div>
        <input type="number" id="emailCount" style="margin-right: 10px;">
        <button id="submitBtn">Submit</button>
      </div>
      <div id="result"></div>
    </div>
  `;

  const emailInput = document.getElementById('emailCount');
  if (firstTrain) {
    emailInput.value = 100;
    emailInput.min = 10;
  } else {
    emailInput.value = 50;
    emailInput.min = 25;
  }

  // Append the container to the body
  document.body.appendChild(container);
  document.getElementById('submitBtn').addEventListener('click', function() {
    // const emailCount = parseInt(document.getElementById("emailCount").value, 10);
    const emailInput = document.getElementById('emailCount');
    const value = parseInt(emailInput.value, 10);
    const min = parseInt(emailInput.min);

    if (value < min) {
      alert(`Please enter a value of at least ${min}`);
      return;
    } else {
      chrome.runtime.sendMessage({ action: 'fetchEmails', count: value }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Message failed:", chrome.runtime.lastError.message);
          return;
        }
        // Handle the response here
        if (response.success)
        {
          console.log("Fetched emails:", response.success);
          labelMode = true;
          askForLabels();
        } else 
        {
          alert(`It looks like you're not signed in. Please reload the page and sign in when the pop up appears to access our services.`);
        }
      });
    }
  });
}

function removeUnread() {
  const emailRows = document.querySelectorAll('.zA');
  emailRows.forEach(row => {
    if (row.classList.contains('zE')) {
      row.style.display = 'none';
    }
  });
}

function showUnread() {
  const emailRows = document.querySelectorAll('.zA');
  emailRows.forEach(row => {
    if (row.classList.contains('zE')) {
      row.style.display = '';
    }
  });
}

/* Create a small container with text instructing the user to label emails
 would like to input. */ 
function askForLabels() {
    emailCount = document.getElementById('emailCount').value;
    console.log("Sending email count to background script:", emailCount);

    const container = document.querySelector('div[style*="position: fixed"]');
    container.innerHTML = `
    <div>
      <label for="emailCount"> Label your ${emailCount} most recent emails for training. </label>
      <div style="margin-bottom: 5px;">
    </div>
    <div>
    <button id="backLabels">Back</button>
      <button id="submitLabels">Submit</button>
    </div>
    <div id="result"></div>
  `;
  document.getElementById('submitLabels').addEventListener('click', function() {
    container.innerHTML = `
    <div>
      <label for="emailCount">Model is now being trained on ${emailCount} most recent emails! </label>
      <div style="margin-bottom: 5px;">
    </div>
    <div id="result"></div>
  `;
    setTimeout(() => container.remove(), 1500);
    chrome.runtime.sendMessage({action: 'initiateTraining'}, (response) => {
      revertEmails();
      revertTitles();
      showUnread();
      localStorage.clear();
      console.log("Response from service-worker:", response.message);
    })
  });

  document.getElementById('backLabels').addEventListener('click', function() {
    // clear database
    chrome.runtime.sendMessage({action: 'clearDB'}, (response) => {
      console.log("Response from service-worker:", response.message);
    })
    // clear buttons
    askForCount();
  });

}

function revertEmails() {

  console.log("Buttons found:", document.querySelectorAll('.priority-button').length);
  console.log("Labels found:", document.querySelectorAll('.priority-button-label').length);
  console.log("Numbers found:", document.querySelectorAll('.email-number').length);

  if (observer) observer.disconnect();
  // Remove all priority buttons
  document.querySelectorAll('.priority-button').forEach(el => el.remove());

  // Remove all priority labels
  document.querySelectorAll('.priority-button-label').forEach(el => el.remove());

  // Remove all prepended numbers
  document.querySelectorAll('.email-number').forEach(el => el.remove());
}

function revertTitles() {
  // Select stars in both "starred" and "unstarred" states
  const stars = document.querySelectorAll('.T-KT[aria-label="Not starred"], .T-KT[aria-label="Starred"]');
  console.log(`Found ${stars.length} stars`);
  stars.forEach((star) => {

    // Select all title elements (sender names) within email rows
    const titles = document.querySelectorAll('span.yP, span.zF');

    titles.forEach((title) => {
      // Increase the left margin to make space for the circle
      title.style.marginLeft = '0px'; // Adjust value as needed
    });
  });
}

function addPriorityButton(row) {
  // Check if a priority button already exists to avoid duplicates
  if (!row.querySelector('.priority-button')) {
    console.log("ADDINT PRIORITY BUTTON");
    const uniqueKey = row.querySelector('[data-legacy-last-message-id]')?.getAttribute('data-legacy-last-message-id');
    const backgroundColor = getComputedStyle(row).backgroundColor;

    if (!uniqueKey) {
      console.error("Unique key not found for row:", row);
      return; // Skip this row if no unique key is found
    }
    const button = document.createElement('button');
    button.className = 'priority-button';
    //button.innerText = `${index + 1}`;
    button.style.cssText = `
      border: 1.5px solid #D3D3D3;
      width: 15px;
      height: 15px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      cursor: pointer;
      position: relative;
      margin-top: 3.7px;
      margin-left: 3px;
      margin-right: 18px;
      font-family: 'Roboto', sans-serif;
      transition: background-color 0.3s, color 0.3s;
    `;

    button.addEventListener('mouseover', () => {
      if (localStorage.getItem(uniqueKey) === true)
      {
        button.style.borderColor = '#444444';
      } 
      button.style.boxShadow = '0 0 0 14px rgba(0, 0, 0, 0.05)';
      label.style.opacity = '0.8';
    });

    button.addEventListener('mouseout', () => {
      if (localStorage.getItem(uniqueKey) === true)
      {
        button.style.borderColor = '#D3D3D3';
      }
      button.style.boxShadow = 'none';
      label.style.opacity = '0';
    });

    // Create the label (like Gmail's tooltip)
const label = document.createElement('div');
label.className = 'priority-button-label';
label.textContent = 'Priority';
label.style.cssText = `
  position: absolute;
  top: 41px; /* below the button */
  left: 87px;
  transform: translateX(-50%);
  background-color: #333;
  color: white;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 3px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
  z-index: 9999;
`;

// Add both to the document
row.appendChild(button);
row.appendChild(label);

    // Restore button state from localStorage
    const isMarkedPriority = localStorage.getItem(uniqueKey) === 'true';
    if (isMarkedPriority) {
      button.style.backgroundColor = '#1a73e8';  // Mark as priority
      button.style.borderColor = '#1a73e8';
    } else {
      button.style.backgroundColor = backgroundColor;
      button.style.border = '1.5px solid #D3D3D3';
    }
    priority = isMarkedPriority;

    button.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent the email click
      if (localStorage.getItem(uniqueKey) === null) {
        button.style.backgroundColor = '#1a73e8';  // Mark as priority
        button.style.borderColor = '#1a73e8';
        localStorage.setItem(uniqueKey, 'true'); // Save state to localStorage
        priority = true;
        console.log(`Marked ${uniqueKey} as priority`);
      } else {
        button.style.backgroundColor = backgroundColor; // Unmark priority
        button.style.border = '1.5px solid #D3D3D3';
        button.style.color = 'black';
        localStorage.removeItem(uniqueKey);
        priority = false;
        console.log(`Unmarked ${uniqueKey} as priority`);
      }
      chrome.runtime.sendMessage({action: 'savePriority', emailId: uniqueKey, isPriority: priority}, (response) => {
        console.log("Response from service-worker:", response.message);
        console.log("Response from service-worker", response.emailId)
        console.log("Response from service-worker", response.isPriority)
      })
    });

    // Add hover effect to the email
    row.addEventListener('mouseenter', () => {
      // Change button border color when hovering over email
      if (localStorage.getItem(uniqueKey) === null)
      {
        button.style.borderColor = '#444444'; // Change to desired color
      } else 
      {
        button.style.borderColor = '#1a73e8';
      }
    });

    row.addEventListener('mouseleave', () => {
      // Reset the border color when mouse leaves the email
      if (localStorage.getItem(uniqueKey) === null)
      {
        button.style.borderColor = '#D3D3D3';
      } else 
      {
        button.style.borderColor = '#1a73e8';
      }
    });
  }
}

function removeButtons(row) 
{
  const button = row.querySelector('.priority-button');
  const label = row.querySelector('.priority-button-label');
  console.log('Found button:', button);
  console.log('Found label:', label);
  if (button) {
    const uniqueKey = row.querySelector('[data-legacy-last-message-id]')?.getAttribute('data-legacy-last-message-id');
    button.remove();
  }
  if (label) {
    label.remove();
  }
}


function injectFakeTab() {
  const tabBarSelector = 'div.aKz'; // Gmail tab container
  const existingTabSelector = 'div.aKz > div';

  // Check if the tab is already injected
  if (document.querySelector('#custom-fake-tab')) return;

  const tabBar = document.querySelector(tabBarSelector);
  if (!tabBar) return;

  // Create the tab element
  const customTab = document.createElement('div');
  customTab.id = 'custom-fake-tab';
  customTab.className = 'aKz'; // For general alignment

  // Apply tab styles
  customTab.innerHTML = `
      <div style="
          display: inline-flex;
          align-items: center;
          padding: 8px 16px;
          margin-left: 4px;
          background-color: #f1f3f4;
          border-radius: 16px 16px 0 0;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: #5f6368;
          box-shadow: inset 0 -1px 0 rgba(0,0,0,.12);
      ">
          <span>Custom</span>
      </div>
  `;

  // Insert after "Social" tab or at the end
  const tabs = tabBar.querySelectorAll('div');
  const socialTab = tabs.length >= 3 ? tabs[2] : null;
  if (socialTab) {
      socialTab.insertAdjacentElement('afterend', customTab);
  } else {
      tabBar.appendChild(customTab);
  }
}

/* Prepends numbers to the subject line of read emails. */
function addNumbers() {
 // Select the container that holds the list of emails
 const emailList = document.querySelectorAll('.zA'); // Adjust the selector if needed
 if (emailList) {
  
     emailList.forEach((email, index) => {
          const emailId = email.querySelector('[data-legacy-last-message-id]')?.getAttribute('data-legacy-last-message-id');
         // Check if the number is already added to avoid duplicates
         if (!email.querySelector('.bog .email-number') && !email.classList.contains('zE')) {
             // Create a span element for the number
             const numberSpan = document.createElement('span');
             emailNum = sessionStorage.getItem(`emailNumber-${emailId}`);
             // console.log("Using email_id: ", emailId);
             if (!emailNum) { 
              emailNum = count + 1; 
              console.log("Using global count: ", emailNum);
            } else 
            {
              console.log("Using saved num: ", emailNum);
            }
             numberSpan.textContent = `${emailNum}. `;
             numberSpan.style.fontWeight = 'bold';
             numberSpan.style.marginRight = '5px';
             numberSpan.className = 'email-number';
             
             // Prepend the number to the email element
             const subject = email.querySelector('.bog'); // Adjust selector for email subject
             if (subject) {
                subject.prepend(numberSpan);
                email.classList.add('numbered');
                if (emailNum == count + 1)
                {
                  count++;
                }
                sessionStorage.setItem(`emailNumber-${emailId}`, emailNum);
             }
         } else 
         {
          console.log("Already numbered");
         }
   });
 }
}

function removeNumbers() {
  const emailList = document.querySelectorAll('.zA'); // Adjust the selector if needed
    
  if (emailList) {
      emailList.forEach((email, index) => {
        // Check if the number is already added to avoid duplicates
        if (email.querySelector('.email-number')) {
          const subject = email.querySelector('.bog');
          const span = subject.querySelector('.email-number');
          if (span) span.remove();
        }
    });
  }
}

function goToAllMail() {
  const openMore = Array.from(document.querySelectorAll('span'))
    .find(span => span.textContent.trim().toLowerCase() === 'more');

  if (openMore) {
    openMore.click(); // Reveal hidden labels like "All Mail"

    // Wait a bit for "All Mail" to appear
    setTimeout(() => {
      const allMailLink = Array.from(document.querySelectorAll('a'))
        .find(a => a.textContent.trim().toLowerCase() === 'all mail');

      if (allMailLink) {
        allMailLink.click();
      } else {
        console.error("Still couldn't find All Mail link after expanding More");
      }
    }, 500); // Adjust delay if needed
  } else {
    console.warn("Couldn't find 'More' button — trying to find All Mail anyway");
    const allMailLink = Array.from(document.querySelectorAll('a'))
      .find(a => a.textContent.trim().toLowerCase() === 'all mail');

    if (allMailLink) {
      allMailLink.click();
    } else {
      console.error("Couldn't find All Mail link");
    }
  }
}

function observeGmailUpdates() {
  observer = new MutationObserver(() => {
    removeUnread();
    addNumbers();

    if (labelMode)
    {
      // Target all email rows
      const emailRows = document.querySelectorAll('.zA');
      console.log("Full emailRows:", emailRows);

      const fullRows = Array.from(emailRows);
      console.log("Arr of rows: ", fullRows);
      const limRows = Array.from(emailRows).slice(0, emailCount);
      console.log("Lim rows:", limRows);
      limRows.forEach(row => addPriorityButton(row));

      // const emailRows = document.querySelectorAll('.zA');
      // emailRows.forEach(row => addPriorityButton(row));
    }
  });

  // Observe changes to the body of the document
  observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('load', () => {
  chrome.runtime.sendMessage({ type: 'checkAuth' });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'clearLocalStorage') {
    console.log("clearing local storage");
    localStorage.clear();
    sessionStorage.clear();
    sendResponse({ message: 'Storage cleared' });
  }
  return true;
});