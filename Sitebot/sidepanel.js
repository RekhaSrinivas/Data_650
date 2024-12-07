let includedImages = [];
// Initialize content when the side panel opens
if (!window.sidePanelInitialized) {
  document.addEventListener('DOMContentLoaded', () => {
    initializeContent();
    loadChatHistory();
    window.sidePanelInitialized = true;
  });
}




function initializeContent() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: extractContent
    }, (results) => {
      if (results && results[0]) {
        window.extractedContent = results[0].result;
      } else {
        console.error("No content extracted.");
      }
    });
  });
}



// Modify the handleAskButtonClick function
function handleAskButtonClick() {
  const question = document.getElementById('question-input').value;
  const chatContainer = document.getElementById('chat-container');

  if (question) {
    const sessionId = localStorage.getItem("session_id");
    // Display the user's question as a chat bubble
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message';
    userMessage.innerText = question;
    chatContainer.appendChild(userMessage);

    // Clear the input field
    document.getElementById('question-input').value = '';

    // Show loading spinner while the answer is being fetched
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'bot-message';
    loadingMessage.innerHTML = '<div class="spinner"></div>';
    chatContainer.appendChild(loadingMessage);
    saveChatMessage('user',question);

    // Scroll the chat to the bottom after each message
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Fetch answer from the backend
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: extractContent
      }, (results) => {
        if (results && results[0]) {
          const pageContent = JSON.stringify(results[0].result);
          const pageURL = tabs[0].url;

          // Include the image URLs in the context
          const imageContext = includedImages.join('\n');
          const prompt = `${question}`;
          console.log(imageContext);
          // Include the page URL as a query parameter
          const apiEndpoint = `<Include your API LINK Here>?page_url=${encodeURIComponent(pageURL)}`;

          fetch(apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({session_id: sessionId, pageContent, prompt, imageContext, pageURL, action:'ask'}),
          })
            .then(response => response.json())
            .then(data => {
              const answer = data.response;

              // Remove the loading message
              loadingMessage.remove();

              // Display the bot's answer as a chat bubble
              const botMessage = document.createElement('div');
              botMessage.className = 'bot-message';
              botMessage.innerText = answer;
              chatContainer.appendChild(botMessage);
              saveChatMessage('bot',answer);
              // Scroll to the latest message
              chatContainer.scrollTop = chatContainer.scrollHeight;

              // Clear the includedImages array after sending
              includedImages = [];
            })
            .catch(error => {
              console.error('Error:', error);
              const errorMessage = document.createElement('div');
              errorMessage.className = 'bot-message';
              errorMessage.innerText = 'Error: Unable to get an answer.';
              chatContainer.appendChild(errorMessage);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            });
        } else {
          console.error('No content extracted.');
        }
      });
    });
  } else {
    alert('Please enter a question.');
  }
}

// Add event listener to the "Ask" button
document.getElementById('ask-button').addEventListener('click', handleAskButtonClick);

// Add event listener for the Enter key in the input field
document.getElementById('question-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleAskButtonClick();
  }
});

// Close button functionality
document.getElementById('close-button').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: "closeSidePanel" });
  window.close(); // Add this line to close the side panel
});

// Function to extract content from the webpage
function extractContent() {
  return {
    text: document.body.innerText || ''
  };
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.runtime.sendMessage({ action: "closeSidePanel" });
  }
});

// // Load chat history when the side panel opens
// document.addEventListener('DOMContentLoaded', loadChatHistory);

// function loadChatHistory() {
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     const pageURL = tabs[0].url;

//     const apiEndpoint = `<Include your API LINK Here>`;

//     fetch(apiEndpoint, { method: 'GET' })
//       .then(response => response.json())
//       .then(data => {
//         const history = data.history || [];
//         const chatContainer = document.getElementById('chat-container');

//         // Display the full chat history
//         history.forEach(entry => {
//           const userMessage = document.createElement('div');
//           userMessage.className = 'user-message';
//           userMessage.innerText = entry.Question;
//           chatContainer.appendChild(userMessage);

//           const botMessage = document.createElement('div');
//           botMessage.className = 'bot-message';
//           botMessage.innerText = entry.Answer;
//           chatContainer.appendChild(botMessage);
//         });

//         // Scroll to the latest message
//         chatContainer.scrollTop = chatContainer.scrollHeight;
//       })
//       .catch(error => console.error('Error fetching chat history:', error));
//   });
// }
// Modify the existing chrome.runtime.onMessage listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addImageToChat") {
    const chatContainer = document.getElementById('chat-container');
    
    // Create image message container
    const imageMessage = document.createElement('div');
    imageMessage.className = 'user-message';
    
    // Create and add image element
    const image = document.createElement('img');
    image.src = request.imageUrl;
    image.style.maxWidth = '100%';
    image.style.height = 'auto';
    image.alt = 'Included image';
    
    imageMessage.appendChild(image);
    chatContainer.appendChild(imageMessage);
    
    // Scroll to the latest message
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Add the image URL to the includedImages array
    includedImages.push(request.imageUrl);
  }
});

// Clear chat history functionality
function clearChatHistory() {
  const chatContainer = document.getElementById('chat-container');
  
  // Fade out animation
  chatContainer.classList.add('fade-out');
  
  setTimeout(() => {
    localStorage.removeItem('chatHistory');
    chatContainer.innerHTML = '';
    chatContainer.classList.remove('fade-out');
    
    const clearMessage = document.createElement('div');
    clearMessage.className = 'bot-message clear-message';
    clearMessage.innerText = 'Chat history cleared.';
    chatContainer.appendChild(clearMessage);
  }, 300); // Match this with your CSS transition time
}

// // Add event listener for the clear chat button
// document.getElementById('clear-chat-button').addEventListener('click', () => {
//   // Optional: Add a confirmation dialog
//   const confirmClear = confirm('Are you sure you want to clear the chat history?');
  
//   if (confirmClear) {
//     chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//       const pageURL = tabs[0].url;
//       const apiEndpoint = 'https://lnxvdim6a2.execute-api.us-east-1.amazonaws.com/dev/';

//       fetch(apiEndpoint, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({ page_url: pageURL, action: 'delete',  sessionId}),
//       })
//       .then(response => response.json())
//       .then(data => {
//         console.log(data.message); // Log the result of deletion
//         clearChatHistory(); // Clear local storage and UI
//       })
//       .catch(error => {
//         console.error('Error:', error);
//         alert('Failed to clear chat history from the server.');
//       });
//     });
//   }
// });


document.getElementById('clear-chat-button').addEventListener('click', () => {
  // Optional: Add a confirmation dialog
  const confirmClear = confirm('Are you sure you want to clear the chat history?');
  
  if (confirmClear) {
    const sessionId = localStorage.getItem('session_id');
    const apiEndpoint = `<Include your API LINK Here>`;

    fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId, action: 'delete' }),
    })
    .then(response => response.json())
    .then(data => {
      console.log(data.message); // Log the result of deletion
      clearChatHistory(); // Clear local storage and UI
    })
    .catch(error => {
      console.error('Error:', error);
      alert('Failed to clear chat history from the server.');
    });
  }
});




function loadChatHistory() {
  const chatContainer = document.getElementById('chat-container');
  const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];

  chatHistory.forEach(message => {
    const messageElement = document.createElement('div');
    messageElement.className = message.type === 'user' ? 'user-message' : 'bot-message';
    messageElement.innerText = message.text;
    chatContainer.appendChild(messageElement);
  });

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function saveChatMessage(type, text) {
  const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
  chatHistory.push({ type, text });
  localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}


let sessionId = localStorage.getItem('session_id') || generateSessionId();
localStorage.setItem('session_id', sessionId);

function generateSessionId() {
  return '_' + Math.random().toString(36).substr(2, 9);
}



