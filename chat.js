  
let isOpen = false;

const chatWindow = document.getElementById('chat-window');
const messagesContainer = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

const messages = [
  {
    role: 'assistant',
    content: 'Привет! Чем могу помочь?'
  }
];

function toggleChat() {
  isOpen = !isOpen;

  if (isOpen) {
    chatWindow.classList.remove('hidden');
  } else {
    chatWindow.classList.add('hidden');
  }

  renderMessages();
}

function renderMessages() {
  messagesContainer.innerHTML = messages.map(msg => `
    <div class="${
      msg.role === 'user'
        ? 'ml-auto bg-blue-600 text-white'
        : 'mr-auto bg-gray-100 text-black'
    } rounded-xl p-3 max-w-[85%]">
      ${msg.content}
    </div>
  `).join('');

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  messages.push({
    role: 'user',
    content: text
  });

  chatInput.value = '';
  renderMessages();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3',
        messages: [
          {
            role: 'user',
            content: text
          }
        ],
        stream: false
      })
    });

    const data = await response.json();

    messages.push({
      role: 'assistant',
      content: data.message?.content || 'Нет ответа'
    });

  } catch (err) {
    messages.push({
      role: 'assistant',
      content: 'Ошибка подключения к Ollama'
    });
  }

  renderMessages();
}