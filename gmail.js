import { LocalDB } from './database.js';
import { htmlToText } from 'html-to-text';
import he from "he";

const dbs = new LocalDB();
const BATCH_SIZE = 5; // Gmail's recommended max concurrent requests
const DELAY_MS = 250
const VOCAB_LEN = 1000


async function listEmails(counts, accessToken, train) {
  console.log("Access Toknee:", accessToken);
  let query = 'is:unread';
  if (train) {
      query = '-is:unread';
  }
  try {
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${counts}`, {
      headers: {
          Authorization: `Bearer ${accessToken}`
      }
  });
    
    // if (!listRes.ok) {
    //   throw new Error(`Failed to list messages: ${listRes.status}`);
    // }
    
    const listData = await listRes.json();

    const messages = listData.messages;
    if (!messages || messages.length === 0) {
        console.log('No emails found.');
        return [];
    }
    return messages;
  } catch (error) {
    console.error('Error listing read emails:', error);
    throw error; // Re-throw for caller to handle
  }
}

async function fetchEmailData(messageIds, accessToken) {
  const results = [];
  
  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    const batch = messageIds.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (msg) => {
      try {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          {
            headers: { 
              Authorization: `Bearer ${accessToken}`,
              'Accept-Encoding': 'gzip'
            }
          }
        );
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return {
          id: msg.id,
          data: await res.json(),
          status: 'success'
        };
      } catch (error) {
        console.error(`Failed to fetch message ${msg.id}:`, error);
        return {
          id: msg.id,
          error: error.message,
          status: 'failed'
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    if (i + BATCH_SIZE < messageIds.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  return results;
}

export async function getVocab(numEmails, token) {
  console.log("In fetch vocab emails");
  try {
    // LOOK at this
    console.log("Token: ", token);
    console.log("NUM EMAILS: ", numEmails);
    const emailIds = await listEmails(numEmails, token, false);

    if (!emailIds || emailIds.length === 0) {
        console.log('No emails found.');
        return [];
    }
    // messageId?
    console.log("Length: ", emailIds.length);
    const emails = await fetchEmailData(emailIds, token);
    console.log("Emails in fetchTrainingemails");
      // await dbs.openDB();
      // Process email headers
    console.log("emails: ", emails);

    let full_text = ""
      for (const email of emails) {
        const emailObj = await processEmail(email);
        full_text += ' ' + emailObj.subject + emailObj.content;
      }
    console.log("FULL text: ", full_text)
    const words = full_text.split(/\s+/);
    
      const freqMap = {};
      for (const word of words) {
        freqMap[word] = (freqMap[word] || 0) + 1;
      }
    
      const sorted = Object.entries(freqMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, VOCAB_LEN)
        .map(([word]) => word);
    
      
      const vocab =  new Set(sorted);
      console.log("VOCAB: ", vocab);
      return vocab;
      
  } catch (err) {
      console.error('Error fetching emails:', err);
      throw err;
  }
}


export async function fetchTrainingEmails(numEmails, token, train) {
  console.log("In fetch training emails");
  try {
    // LOOK at this
    console.log("Token: ", token);
    console.log("NUM EMAILS: ", numEmails);
    const emailIds = await listEmails(numEmails, token, train);

    if (!emailIds || emailIds.length === 0) {
        console.log('No emails found.');
        return [];
    }
    // messageId?
    console.log("Length: ", emailIds.length);
    const emails = await fetchEmailData(emailIds, token);
    console.log("Emails in fetchTrainingemails");
      // await dbs.openDB();
      // Process email headers
    console.log("emails: ", emails);
    if (train) {
      const bobs = await dbs.getAllEmails("trainingEmails");
      console.log("Emails after putting in database: ", bobs);

    } else 
    {
      const bobs = await dbs.getAllEmails("inboxEmails");
      console.log("Emails after putting in database: ", bobs);
    }


    console.log("BEFORE FETCHIN TRAINING EMIALS");
    const stp = await dbs.getAllEmails("predictedEmails");
    console.log("Predicted database: ", stp);

      for (const email of emails) {
        const emailObj = await processEmail(email);
          if (train) {
            // If email id is same as in predictedEmails, remove from predictedEmails
            if (emailObj.id && await dbs.checkEmailExists(emailObj.id))
            {
              // if labeled, remove the label from it 
              const predPriority = await dbs.getPredPriority(emailObj.id);
              if (predPriority && predPriority === 1) {
                console.log("PREDICTED PRIORITY IS TRUE");

                await removePredictionLabel(emailObj.id, token);
              } 
              await dbs.deleteEntry(emailObj.id, "predictedEmails");
              console.log("EMAIL IS PRESENT IN PREDICTION ONE OMG");
            }
            await dbs.saveToTrain(emailObj);
          } else 
          {
            await dbs.saveToInbox(emailObj);
          }
      }
      if (train) {
        const bobs = dbs.getAllEmails("trainingEmails");
        console.log("Emails after putting in database: ", bobs);
      } else 
      {
        const bobs = dbs.getAllEmails("inboxEmails");
        console.log("Emails after putting in database: ", bobs);
      }
      return emails;
      
  } catch (err) {
      console.error('Error fetching emails:', err);
      throw err;
  }
}


// Make sure we clear the predicted database before we call this in train()
export async function fetchInboxEmails(numEmails, token) {
  const priorityLabelId = await new Promise((resolve) => {
    chrome.storage.local.get("priorityLabelId", (result) => {
      resolve(result.priorityLabelId);
    });
    });

  console.log("PRIORITY LABEL ID: ", priorityLabelId);
  console.log("In fetch inbox emails");
  try {
    // LOOK at this
    const train = false;
    console.log("Token: ", token);
    console.log("NUM EMAILS: ", numEmails);
    let emailIds = await listEmails(numEmails, token, train);

    if (!emailIds || emailIds.length === 0) {
        console.log('No emails found.');
        return [];
    }

    console.log("BEFORE FETCHIN TRAINING EMIALS");
    const stp = await dbs.getAllEmails("predictedEmails");
    console.log("Predicted database: ", stp);

    // Remove emailIds already in predictedDB
    const checks = await Promise.all(emailIds.map(id => dbs.checkEmailExists(id.id)));
    emailIds = emailIds.filter((id, i) => !checks[i]);

    // messageId?
    console.log("Length: ", emailIds.length);
    const emails = await fetchEmailData(emailIds, token);
    console.log("Emails in fetchInboxEmails");
      // await dbs.openDB();
      // Process email headers
    console.log("emails: ", emails);

    if (train) {
      const bobs = await dbs.getAllEmails("trainingEmails");
      console.log("Emails after putting in database: ", bobs);
    } else 
    {
      const bobs = await dbs.getAllEmails("inboxEmails");
      console.log("Emails after putting in database: ", bobs);
    }
      for (const email of emails) {
          const emailObj = processEmail(email);
          if (train) {
            await dbs.saveToTrain(emailObj);
          } else 
          {
            await dbs.saveToInbox(emailObj);
          }
      }
      if (train) {
        const bobs = await dbs.getAllEmails("trainingEmails");
        console.log("Emails after putting in database: ", bobs);
      } else 
      {
        const bobs = await dbs.getAllEmails("inboxEmails");
        console.log("Emails after putting in database: ", bobs);
      }
      return emails;
      
  } catch (err) {
      console.error('Error fetching emails:', err);
      throw err;
  }
}

function processEmail(email) {
  console.log("One email in gmail: ", email);
  const headers = email.data.payload.headers;

  // extract email address from header
  const possible_sender = headers.find((header) => header.name === 'From')?.value || 'Unknown';
  const match = possible_sender.match(/<(.*?)>/);
  const emailAddr = match ? match[1] : possible_sender.trim().split(/\s+/)[0];
  const sender = cleanText(emailAddr);

  // extract subject from header
  const subject = cleanText(headers.find((header) => header.name === 'Subject')?.value || 'No Subject');
  const sizeEstimate = email.data.sizeEstimate;
  const internalDate = email.data.internalDate;

  const payload = email.data.payload;
  let content = "";
  // extract and decode email content
  if (payload.body?.data) {
      const html = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      content = htmlToText(html, { ignoreHref: true });
      content = he.decode(content);
  } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && !content) {
            content =  atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            break;
        }
        if (part.mimeType === "text/html" && !content) {
            const html =  atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            content = htmlToText(html, { ignoreHref: true })
            content = he.decode(content);
            break;
        }
    }
  }
  content = content.replace(/&zwnj;/g, '');
  // getLinks counts the number of links in content
  let numLinks = 0;
  [content, numLinks] = countAndRemoveLinks(content);
  content = cleanText(content);

  // Parse labels to determine categories
  const labelIds = email.data.labelIds || [];
  const spam = labelIds.includes("SPAM") ? 1 : 0;
  const personal = labelIds.includes("CATEGORY_PERSONAL") ? 1 : 0;
  const social = labelIds.includes("CATEGORY_SOCIAL") ? 1 : 0;
  const promotional = labelIds.includes("CATEGORY_PROMOTIONS") ? 1 : 0;
  const updates = labelIds.includes("CATEGORY_UPDATES") ? 1 : 0;
  const forums = labelIds.includes("CATEGORY_FORUMS") ? 1 : 0;

  // Check if multithread
  const multiThread = email.id !== email.data.threadId;
  const emailObj = {
    id: email.id,
    sender: sender,
    subject: subject,
    sizeEstimate: sizeEstimate, 
    internalDate: internalDate,
    content: content, 
    numLinks: numLinks, 
    multiThread: multiThread, 
    spam: spam, 
    personal: personal, 
    social: social,
    promotional: promotional, 
    updates: updates, 
    forums: forums,
    priority: 0
  }
  return emailObj;
}

function decodeHTMLEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}


  /* Removes links from given text and counts them. Returns the cleaned text and number of links removed */
  function countAndRemoveLinks(text) {
    const linkRegex = /[<\[]?https?:\/\/[^\s>\]]*/g;
    const matches = text.match(linkRegex);
    const numLinks = matches ? matches.length : 0;
    const cleanedText = text.replace(linkRegex, '');
    return [cleanedText, numLinks];
  }

  /* Removes all punctuation, numbers, and variable whitespace from given text, and 
  converts all letters to lowercase. */
  function cleanText(text) {
    if (typeof text !== 'string')
    {
      return null;
    }

    // text = text.replace(/<https?:\/\/[^\s]*/g, '')  // Match and delete <http://...> or <https://...> up to the first space
    // .replace(/\[https?:\/\/[^\s]*/g, '')  // Match and delete [http://...] or [https://...] up to the first space
    // .replace(/https?:\/\/[^\s]*/g, '');
    // Replace em-dashes with a space 
    text = text.replace(/—/g, ' ');

    // Replace underscores with a space
    text = text.replace(/_/g, ' ');

    // Remove anything between %%word%% (including the %%...%%)
    text = text.replace(/%%.*?%%/g, '');

    // Remove anything between [ and ] (including the brackets)
    text = text.replace(/\[.*?\]/g, '');

    // Remove all non-word non-space characters
    text = text.replace(/[^\w\s]/g, '');
  
    // Remove all numbers
    text = text.replace(/\b\w*\d\w*\b/g, '');

    // Remove all HTML entities
    text = text.replace(/&[#a-zA-Z0-9]+;/g, '');
  
    // Convert to lowercase
    text = text.toLowerCase();
  
    // Replace tabs and multiple spaces with a single space
    text = text.replace(/[\x00-\x1F\x7F\u200B\u200C\u200D\u00A0\u202F\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

    const stopWords = new Set([
      "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
      "you", "your", "yours", "yourself", "yourselves",
      "he", "him", "his", "himself", "she", "her", "hers",
      "herself", "it", "its", "itself", "they", "them",
      "their", "theirs", "themselves", "what", "which", "who",
      "whom", "this", "that", "these", "those", "am", "is", "are",
      "was", "were", "be", "been", "being", "have", "has", "had",
      "having", "do", "does", "did", "doing", "a", "an", "the",
      "and", "but", "if", "or", "because", "as", "until", "while",
      "of", "at", "by", "for", "with", "about", "against", "between",
      "into", "through", "during", "before", "after", "above", "below",
      "to", "from", "up", "down", "in", "out", "on", "off", "over", "under",
      "again", "further", "then", "once", "here", "there", "when", "where",
      "why", "how", "all", "any", "both", "each", "few", "more", "most",
      "other", "some", "such", "no", "nor", "not", "only", "own", "same",
      "so", "than", "too", "very", "can", "will", "just", "dont", "should", "now"
    ]);

    // Split the sentence into an array of words, remove stop words, and join the remaining words
    text = text.split(' ').filter(w => !stopWords.has(w)).join(' ');
    return text;
  }


  async function removePredictionLabel(messageId, accessToken) {
    console.log("REMOVING LABEL");
    console.log("MESSAGE ID: ", messageId);

    const priorityLabelId = await new Promise((resolve) => {
      chrome.storage.local.get("priorityLabelId", (result) => {
        resolve(result.priorityLabelId);
      });
      });
      console.log("Stored Label ID:", priorityLabelId);
    
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;
  
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        removeLabelIds: [priorityLabelId]
      }),
    });
  
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to remove label from email:', errorText);
    } else {
      const result = await response.json();
      console.log('Label removed from email:', result);
    }
  }


  export async function getDBEmails(tableName) {
    const emails = await dbs.getAllEmails(tableName);
    return emails;
  }

  export async function clearDBEmails(tableName) {
    await dbs.clearEmails(tableName);
  }
  

  export async function saveEmailPriority(emailId, isPriority) {
    await dbs.updatePriority(emailId, isPriority);
  } 


  export async function saveToPredictedDB(emailID, prediction) {
    await dbs.saveToPredicted(emailID, prediction);
  }