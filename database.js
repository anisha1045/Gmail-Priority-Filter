class LocalDB {
  constructor() {
    if (LocalDB.instance) return LocalDB.instance;

    this.dbName = "GmailExtensionDB";
    this.dbVersion = 1;
    this.db = null;

    LocalDB.instance = this;
  }

  async openDB() {
    console.log("IN OPEN DB");
    if (this.db) {
      console.log("THIS DB");
      return this.db;
    }

    return new Promise((resolve, reject) => {
      this.dbVersion++;
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = (event) => {
        console.log("Upgrading or creating DB");
        const db = event.target.result;

        const createStore = (name) => {
          if (!db.objectStoreNames.contains(name)) {
            console.log(`Creating object store: ${name}`);
            db.createObjectStore(name, { keyPath: "id" });
          }
        };

        createStore("trainingEmails");
        createStore("inboxEmails");
        createStore("predictedEmails");
      };

      request.onsuccess = (event) => {
        console.log("DB opened successfully");
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("Failed to open DB:", event.target.error);
        reject("Failed to open IndexedDB");
      };
    });
  }

  async saveToTrain(email) {
    const db = await this.openDB();
  
    return new Promise((resolve, reject) => {
      if (email.id === undefined) {
        console.log("UNDEFINED EMAIL ID");
        return reject("Email ID is undefined");
      }
      const tableName = "trainingEmails";
      const txn = db.transaction([tableName], "readwrite");
      const table = txn.objectStore(tableName);
  
      const getRequest = table.get(email.id);
      getRequest.onsuccess = () => {
        if (getRequest.result) {
          // Duplicate found, skip saving
          console.log(`Email with ID ${email.id} already exists. Skipping.`);
          resolve();
        } else {
          table.put({ ...email, priority: 0 });
        }
      };
  
      getRequest.onerror = (event) => {
        console.error("IndexedDB read error:", event.target.error);
        reject("Failed to check existing email");
      };
      
      txn.oncomplete = () => {
        console.log("Transaction complete");
        resolve();
      };
      txn.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject("Failed to save email");
      };
    });
  }

  async saveToInbox(email, priority) {
    console.log("In save to inbox");
    const db = await this.openDB();
    const tableName = "inboxEmails";
    return new Promise((resolve, reject) => {
      if (email === undefined) {
        console.log("UNDEFINED EMAIL ID");
        return reject("Email ID is undefined");
      }
  
      const txn = db.transaction([tableName], "readwrite");
      const table = txn.objectStore(tableName);
  
      table.put({ ...email, priority: 0 });
  
      txn.oncomplete = () => {
        console.log("Transaction complete");
        resolve();
      };
      txn.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject("Failed to save email");
      };
    });
  }

  async saveToPredicted(emailID, priority) {
    console.log("In save to inbox");
    const db = await this.openDB();
    const tableName = "predictedEmails";
    return new Promise((resolve, reject) => {
      if (emailID === undefined) {
        console.log("UNDEFINED EMAIL ID");
        return reject("Email ID is undefined");
      }
  
      const txn = db.transaction([tableName], "readwrite");
      const table = txn.objectStore(tableName);
  
      table.put({id: emailID, priority});
  
      txn.oncomplete = () => {
        console.log("Transaction complete");
        resolve();
      };
      txn.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject("Failed to save email");
      };
    });
  }

  async getAllEmails(tableName) {
    const db = await this.openDB();
    console.log("db opened in get all emails");
    console.log("Opening transaction on store:", tableName);
    console.log("Available stores:", db.objectStoreNames);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readonly');
      const objectStore = transaction.objectStore(tableName);
      const getAllRequest = objectStore.getAll();
  
      getAllRequest.onsuccess = (event) => {
        console.log(`Contents of store "${tableName}":`, event.target.result);
        resolve(event.target.result);
      };
  
      getAllRequest.onerror = (event) => {
        console.error(`Error reading store "${tableName}":`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  async updatePriority(emailId, isPriority) {
    const db = await this.openDB();
    const tableName = "trainingEmails";

    return new Promise((resolve, reject) => {
      const txn = db.transaction([tableName], "readwrite");
      const table = txn.objectStore(tableName);
      const request = table.get(emailId);

      request.onsuccess = () => {
        const email = request.result;
        if (!email) return reject("Email not found");

        email.priority = isPriority ? 1 : 0;
        table.put(email);

        txn.oncomplete = () => resolve();
        txn.onerror = () => reject("Failed to update priority");
      };

      request.onerror = () => reject("Failed to retrieve email");
    });
  }

  async checkEmailExists(emailID) {
    console.log("Checking emailID:", emailID);
    const db = await this.openDB();
    const tableName = "predictedEmails";

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readonly');
      const objectStore = transaction.objectStore(tableName);
      const getRequest = objectStore.get(emailID);
  
      getRequest.onsuccess = (event) => {
        const result = event.target.result;
        console.log(`Check for emailID "${emailID}" in store "${tableName}":`, result);
        resolve(result !== undefined);
      };
  
      getRequest.onerror = (event) => {
        console.error(`Error checking emailID "${emailID}" in store "${tableName}":`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getPredPriority(emailID) {
    const db = await this.openDB();
    const tableName = "predictedEmails";
  
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readonly');
      const objectStore = transaction.objectStore(tableName);
      const getRequest = objectStore.get(emailID);
  
      getRequest.onsuccess = (event) => {
        const result = event.target.result;
        console.log(`Retrieved email "${emailID}" from "${tableName}":`, result);
        if (result && result.priority !== undefined) {
          console.log("Returning: ", result.priority);
          resolve(result.priority);
        } else {
          resolve(null); // or reject(new Error('Priority not found')) if preferred
        }
      };
  
      getRequest.onerror = (event) => {
        console.error(`Error retrieving priority for "${emailID}" in "${tableName}":`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  async deleteEntry(emailID, tableName) {
    const db = await this.openDB();
    console.log("db opened in deleteEmailByID");
    console.log("Opening transaction on store:", tableName);
    console.log("Available stores:", db.objectStoreNames);
  
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readwrite');
      const objectStore = transaction.objectStore(tableName);
      const deleteRequest = objectStore.delete(emailID);
  
      deleteRequest.onsuccess = () => {
        console.log(`Successfully deleted emailID "${emailID}" from store "${tableName}".`);
        resolve();
      };
  
      deleteRequest.onerror = (event) => {
        console.error(`Error deleting emailID "${emailID}" from store "${tableName}":`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  async clearEmails(tableName) {
    console.log("In clear emails");
    const db = await this.openDB();

    console.log("Opening transaction on store:", tableName);
    console.log("Available stores:", db.objectStoreNames);

    return new Promise((resolve, reject) => {
      const txn = db.transaction([tableName], "readwrite");
      const table = txn.objectStore(tableName);
      table.clear();

      txn.oncomplete = () => resolve();
      txn.onerror = () => reject("Failed to clear emails");
    });
  }
}

export { LocalDB };