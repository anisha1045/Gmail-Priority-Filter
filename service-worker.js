import { fetchTrainingEmails, fetchInboxEmails, getDBEmails, clearDBEmails, saveEmailPriority, saveToPredictedDB, getVocab } from './gmail.js';


let emailsStored = false;
let trainingSignal = false;
let isTraining = false;
let vocabSaved = false
let volatileToken = null;
const API_BASE = "https://email-priority-filter-backend.onrender.com";

chrome.runtime.onMessage.addListener(async function (message, sender, sendResponse) {
  if (message.type === 'checkAuth') {
    console.log('Received checkAuth, starting authentication...');

    await getAccessToken();
    const firstTrain = await new Promise((resolve) => {
      chrome.storage.local.get("firstTrain", (result) => {
        resolve(result.firstTrain);
      });
      });
    console.log("First train: ", firstTrain);
    if (firstTrain === false) {
      predictPriority();
    }
    return true;
  }
});


function getUserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get('userId', (result) => {
      if (result.userId) {
        resolve(result.userId);
      } else {
        const uuid = crypto.randomUUID();
        chrome.storage.local.set({ userId: uuid }, () => {
          resolve(uuid);
        });
      }
    });
  });
}

async function authFlow() {
  console.log("In auth flow");
  const userId = await getUserId();

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({
      url: `${API_BASE}/auth?state=${encodeURIComponent(userId)}`,
      interactive: true,
    }, function (redirectUrl) {
      if (chrome.runtime.lastError || !redirectUrl) {
        console.error('Auth failed', chrome.runtime.lastError);
        reject(null);
        return;
      }
      console.log("Auth succeeded, redirect URL:", redirectUrl);

      // Optionally extract data from redirectUrl here
      resolve(redirectUrl);
    });
  });
}

async function getAccessToken() {
  console.log("Getting access token");

  if (volatileToken) {
    console.log("vol token:", volatileToken);
    return volatileToken;
  }

  const uuid = await getUserId();
  let token = await fetchToken(uuid);

  if (!token) {
    console.log("Token not found, starting auth flow");
    await authFlow();
    token = await fetchToken(uuid);
  }

  if (token) {
    volatileToken = token;
    console.log("Saving in vol token:", volatileToken);
  }

  return token;
}

async function fetchToken(uuid) {
  try {
    const response = await fetch(`${API_BASE}/get_tokens/${uuid}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.tokens?.access_token || null;
  } catch (e) {
    console.error("Error fetching token:", e);
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchEmails') {
    (async () => {
      console.log("Fetching emails");
      const count = request.count;
      
      const access_token = await getAccessToken();

      if (!access_token) {
        console.log("DID NOT GET TOKEN");
        sendResponse({ success: false });
        return;
      }
      const firstTrain = await new Promise((resolve) => {
        chrome.storage.local.get("firstTrain", (result) => {
          resolve(result.firstTrain);
        });
        });

        console.log("First train: ", firstTrain);
        // TO DO: PUT THIS RIGHT BEFORE YOU CALL TRAIN
        if (firstTrain === undefined) {
          const labelName = 'Priority';
          const labelId = await createLabel(labelName, access_token);
          
          if (!labelId) {
            console.log("THROW ERROR");
            return;
          }
        
          await new Promise((resolve) => {
            chrome.storage.local.set({ priorityLabelId: labelId }, resolve);
          });
        
          console.log("LABEL ID:", labelId);
        }
        
        sendResponse({ success: true });
        clearDBEmails("trainingEmails");
        await Promise.all([
          fetchTrainingEmails(count, access_token, true),
        ]);
        console.log("Done fetching emails");

        chrome.storage.local.set({ emailsStored: true });
        const { vocabSaved, trainingSignal, isTraining } = await chrome.storage.local.get([
          "vocabSaved",
          "trainingSignal",
          "isTraining",
        ]);
        if (vocabSaved && trainingSignal && !isTraining) {
          train();
        }
    })();

    return true; // Keeps the message channel open for the async function
  }
});





chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
  if (request.action === 'initiateTraining') {
    sendResponse({ message: "Received signal to initiate training." });
    chrome.storage.local.set({ trainingSignal: true });
    const { vocabSaved, emailsStored, isTraining } = await chrome.storage.local.get([
      "vocabSaved",
      "emailsStored",
      "isTraining",
    ]);
    console.log("Vocab saved: ", vocabSaved);
    console.log("Emails stored: ", emailsStored);
    console.log("Training signal ", trainingSignal);
    console.log("isTraining: ", !isTraining);
    if (vocabSaved && emailsStored && !isTraining)
      {
        train();
      }
    // Return true here to indicate async response
    return true;
    }
});

async function train() {
  // DELETE THIS
  // indexedDB.deleteDatabase("GmailExtensionDB");
  chrome.storage.local.set({ isTraining: true });
  console.log("IN TRAIN");
  const emails = await getDBEmails("trainingEmails");
  console.log("Orig Train Emails: ", emails);

  // Send emails over to server by batches for storage
  const batchSize = 50;
  const uiud = await getUserId();
  const firstTrain = await new Promise((resolve) => {
    chrome.storage.local.get("firstTrain", (result) => {
      resolve(result.firstTrain);
    });
  });
  console.log("First train is : ", firstTrain);
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    if (firstTrain === undefined && i === 0) {
      // first time training

      const preferences = await new Promise((resolve) => {
        chrome.storage.local.get('preferences', (result) => {
          resolve(result.preferences);
        });
      });

      console.log("PREF: ", preferences);
  
      const response = await fetch(`${API_BASE}/start_train`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uiud: uiud,
          preferences: preferences,  // pass your preferences object here
          emails: batch
        })
      });

      if (!response.ok) {
        throw new Error(`Python server returned an error: ${response.status} ${response.statusText}`);
      }
      console.log("SETTING FIRST TRAIN TO FALSE");
      chrome.storage.local.set({ firstTrain: false });
    } else {
      console.log("Calling train iter");
      const response = await fetch(`${API_BASE}/train_iter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uiud: uiud,
          emails: batch
        })
      });
      if (!response.ok) {
        throw new Error(`Python server returned an error: ${response.status} ${response.statusText}`);
      }
    }
  }
  clearDBEmails("trainingEmails");
  clearDBEmails("predictedEmails");
  emailsStored = false;
  trainingSignal = false;
  isTraining = false;
  chrome.storage.local.set({ emailsStored: false });
  chrome.storage.local.set({ trainingSignal: false });
  chrome.storage.local.set({ isTraining: false });
  chrome.storage.local.remove('preferences', function() {
    console.log('Preferences cleared.');
  });

  // Predict priority 
  console.log("predcting priority");
  await predictPriority();

  const labelName = 'Priority';
  chrome.tabs.query({ url: '*://mail.google.com/*' }, (tabs) => {
    if (tabs.length > 0) {
      // Switch the first matching Gmail tab to the label view
      chrome.tabs.update(tabs[0].id, {
        url: `https://mail.google.com/mail/u/0/#label/${encodeURIComponent(labelName)}`
      });
    }
  });
}

chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
  if (request.action === 'savePriority') {
    const { emailId, isPriority } = request;
    sendResponse({message: "Received the priority status.", emailId: request.emailId, isPriority: request.isPriority})
    const before = await getDBEmails("trainingEmails");
    console.log("Emails before: ", before);
    saveEmailPriority(emailId, isPriority);
    const emails = await getDBEmails("trainingEmails");
    console.log("Emails after: ", emails);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'savePreferences') {
    const pref = request.preferences;
    sendResponse({message: "Received the pref.", preference: pref})
    console.log('Saving preferences:', pref);
    chrome.storage.local.set({ preferences: pref });
  }
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'saveVocab') {
    (async () => {
      console.log("SAVING VOCAB");
      const access_token = await getAccessToken();

      if (!access_token) {
        console.log("DID NOT GET TOKEN");
        sendResponse({ success: false });
        return;
      } else {
        sendResponse({ success: true });
      }

      const uiud = await getUserId();
      const vocabSet = await getVocab(500, access_token);
      const vocab = Array.from(vocabSet);
      console.log("Vocab ", vocab);

      const response = await fetch(`${API_BASE}/save_user_vocab`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uiud: uiud,
          vocab: vocab
        })
      });

      if (!response.ok) {
        console.error(`Python server returned an error: ${response.status} ${response.statusText}`);
        sendResponse({ success: false });
        return;
      }
      chrome.storage.local.set({ vocabSaved: true });
      const { emailsStored, trainingSignal, isTraining } = await chrome.storage.local.get([
        "emailsStored",
        "trainingSignal",
        "isTraining",
      ]);
      if (emailsStored && trainingSignal && !isTraining)
      {
        train();
      }
    })();

    return true;
  }
});

async function predictPriority() 
{
  console.log("IN PREDICT PRIORITY!");
  const access_token = await getAccessToken();

  if (!access_token) {
    console.log("DID NOT GET TOKEN");
    sendResponse({ success: false });
    return;
  }
  console.log("CLEARING INBOX EMAILS");
  await clearDBEmails("inboxEmails");
  console.log("GETTING INBOX EMAILS ");
  const nonemails = await getDBEmails("inboxEmails");
  console.log("Orig Inbox Emails: ", nonemails); 

  await Promise.all([
    fetchInboxEmails(200, access_token),
    // fetchTrainingEmails(10, access_token, false),
  ]);
  const emails = await getDBEmails("inboxEmails");
  console.log("Emails for prediction: ", emails);
  const uiud = await getUserId();
  const batchSize = 100;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const response = await fetch(`${API_BASE}/predict_priority`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uiud: uiud,
        emails: batch
      })
    });
    if (!response.ok) {
      throw new Error(`Python server returned an error: ${response.status} ${response.statusText}`);
    }
    const result = await response.json();
    const predictions = result.predictions
    console.log('Predictions:', predictions);
    const batchIDs = batch.map(email => email.id);

    for (let i = 0; i < batchIDs.length; i++) {
      await saveToPredictedDB(batchIDs[i], predictions[i]);
      if (predictions[i] == 1) {
        await displayPrediction(batchIDs[i], access_token);
      }
    }


    // Save email IDs and priorities to indexedDB

    const bob = await getDBEmails("predictedEmails");
    console.log("Predicted emails after: ", bob);
  }
}

async function displayPrediction(messageId, accessToken) {
  console.log("DISPLAYING PREDICTION");
  console.log("MESSAGE ID: ", messageId);


  const priorityLabelId = await new Promise((resolve) => {
  chrome.storage.local.get("priorityLabelId", (result) => {
    resolve(result.priorityLabelId);
  });
  });
  console.log("Stored Label ID:", priorityLabelId);


  console.log("Lable: ", priorityLabelId);
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addLabelIds: [priorityLabelId]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to label email:', errorText);
  } else {
    const result = await response.json();
    console.log('Email labeled as Priority:', result);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'eraseData') {
    (async () => {
      console.log("IN ERASE DATA");

      try {
        const tabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
        if (tabs[0]?.id) {
          try {
            const contentResp = await chrome.tabs.sendMessage(tabs[0].id, {
              action: 'clearLocalStorage'
            });
            console.log("Content script response:", contentResp);
          } catch (err) {
            console.error("Failed to send message to tab", tabs[0].id, err);
          }
        }

        await clearDBEmails("trainingEmails");
        await clearDBEmails("inboxEmails");
        await clearDBEmails("predictedEmails");

        const emails = await getDBEmails("trainingEmails");
        console.log("Emails after: ", emails);
        const nonemails = await getDBEmails("inboxEmails");
        console.log("Inbox emails after: ", nonemails);
        const hiemails = await getDBEmails("predictedEmails");
        console.log("Predicted emails after: ", hiemails);

        const accessToken = await getAccessToken();
        const priorityLabelId = await new Promise((resolve) => {
          chrome.storage.local.get("priorityLabelId", (result) => {
            resolve(result.priorityLabelId);
          });
        });

        await removeLabel(priorityLabelId, accessToken);

        const uiud = await getUserId();
        const response = await fetch(`${API_BASE}/delete_data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uiud: uiud })
        });

        chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) {
            console.error("Error clearing storage:", chrome.runtime.lastError);
          } else {
            console.log("chrome.storage.local cleared.");
          }
        });

        volatileToken = null;

        if (!response.ok) {
          console.log("Failed to erase data on server.");
          sendResponse({ success: false, message: "Unable to erase data." });
        } else {
          console.log("Successfully erased data on server.");
          sendResponse({ success: true, message: "Successfully erased data." });
        }
      } catch (err) {
        console.error("Failed to process eraseData:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // IMPORTANT: keep message channel alive for async
  }
});


async function createLabel(labelName, accessToken) {
  console.log("CREATING LABEL");
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/labels';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to create label:', errorText);
    return null;
  } else {
    const data = await response.json();
    console.log('Label created:', data);
    return data.id; // This is your new label ID
  }
}

async function removeLabel(labelId, accessToken) {
  console.log("REMOVING LABEL");
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return true;
}
