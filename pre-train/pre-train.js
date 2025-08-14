

// document.getElementById('save-button').addEventListener('click', () => {
//     console.log("Submitted user preferences.");
//     const inputValue = document.getElementById('preferences-input').value.trim();
//     if (inputValue) {
//         console.log("Input value is more than nothing: ", inputValue);

//         chrome.runtime.sendMessage({action: 'savePreferences', preferences: inputValue}, (response) => {
//             console.log("Response from service-worker", response.preferences)
//         })
//         // Send the input data to the Node.js server
//         // fetch('http://localhost:8080/generate-data', {
//         // method: 'POST',
//         // headers: {
//         //     'Content-Type': 'application/json'
//         // },
//         // body: JSON.stringify({ userInput: inputValue })
//         // })
//         // .then(response => response.json())
//         // .then(data => {
//         // console.log('Data received from server:', data);
//         // alert('Data submitted successfully!');
//         // })
//         // .catch(error => {
//         // console.error('Error submitting data:', error);
//         // });
//         // if (window.opener) {
//         //     document.body.innerHTML = `
//         //         <div id="thank-you-message">Thank you! Preferences saved.</div>
//         //     `;
//         //     document.head.innerHTML += `
//         //         <style>
//         //             #thank-you-message {
//         //                 display: flex;
//         //                 justify-content: center;
//         //                 align-items: center;
//         //                 height: 100vh;
//         //                 font-size: 24px;
//         //                 font-weight: light;
//         //                 text-align: center;
//         //             }
//         //             body {
//         //                 margin: 0;
//         //             }
//         //         </style>
//         //     `;
//         //     setTimeout(() => window.close(), 1500); // Close after 1.5 seconds
//         // }
//         if (window.opener) {
//             document.body.innerHTML = `
//                 <div id="thank-you-message">
//                     <p>Thank you! Preferences saved. To continue, please submit your 500 most recent emails for vocabulary analysis.</p>
//                     <button id="submit-emails">Submit</button>
//                 </div>
//             `;
//             document.head.innerHTML += `
//                 <style>
//                     #thank-you-message {
//                         display: flex;
//                         flex-direction: column;
//                         justify-content: center;
//                         align-items: center;
//                         height: 100vh;
//                         font-size: 20px;
//                         font-weight: 300;
//                         text-align: center;
//                         padding: 0 20px;
//                         font-family: 'Roboto', sans-serif;
//                         font-size: 20px;
//                         text-align: center;
//                         color: #444444;
//                     }
//                     #submit-emails {
//                         margin-top: 20px;
//                         padding: 10px 20px;
//                         font-size: 16px;
//                         font-family: 'Roboto', sans-serif;
//                         cursor: pointer;
//                         border: none;
//                         border-radius: 8px;
//                         background-color: #4CAF50;
//                         color: white;
//                     }
//                     #submit-emails:hover {
//                         opacity: 0.9;
//                     }
//                     body {
//                         margin: 0;
//                     }             
//                 </style>
//             `;
        
//             // Add button functionality
//             document.getElementById("submit-emails").onclick = () => {
//                 chrome.runtime.sendMessage({action: 'saveVocab'}, (response) => {
//                     // FIX THIS
//                     if (window.opener && response.success)
//                     {
//                         console.log("Saved  vocab:", response.success);
//                             window.opener.postMessage({ action: "submitEmails", count: 500 }, "*");
//                             if (window.opener) {
//                             document.body.innerHTML = `
//                                 <div id="thank-you-message">Thank you! Vocabulary saved.</div>
//                             `;
//                             document.head.innerHTML += `
//                                 <style>
//                                     #thank-you-message {
//                                         display: flex;
//                                         justify-content: center;
//                                         align-items: center;
//                                         height: 100vh;
//                                         font-size: 24px;
//                                         font-weight: light;
//                                         text-align: center;
//                                     }
//                                     body {
//                                         margin: 0;
//                                     }
//                                 </style>
//                             `;
//                             setTimeout(() => window.close(), 1500); // Close after 1.5 seconds
//                         }
//                     } else 
//                     {
//                         console.log("Pre train alert");
//                         alert(`It looks like you're not signed in. Please reload the page and sign in when the pop up appears to access our services.`);
//                     }
//                 })
//             };
//         }

//     } else {
//         console.log("Input value is less than nothing");
//         alert('Please enter some data!');
//     }
// });

// Add button functionality
document.getElementById("submit-emails").onclick = () => {
    chrome.runtime.sendMessage({action: 'saveVocab'}, (response) => {
        if (window.opener && response.success)
        {
            console.log("Saved  vocab:", response.success);
                window.opener.postMessage({ action: "submitEmails", count: 500 }, "*");
                if (window.opener) {
                document.body.innerHTML = `
                    <div id="thank-you-message">Thank you! Vocabulary saved.</div>
                `;
                document.head.innerHTML += `
                    <style>
                        #thank-you-message {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            font-size: 24px;
                            font-weight: light;
                            text-align: center;
                        }
                        body {
                            margin: 0;
                        }
                    </style>
                `;
                setTimeout(() => window.close(), 1500); // Close after 1.5 seconds
            }
        } else 
        {
            console.log("Pre train alert");
            alert(`It looks like you're not signed in. Please reload the page and sign in when the pop up appears to access our services.`);
        }
    })
};