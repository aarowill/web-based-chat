/* eslint-disable no-undef */
// Establish a socket.io connection
const socket = io('http://localhost:3030');

// Initialize the feathers client through socket.io
const client = feathers();
client.configure(feathers.socketio(socket));

const setup = async () => {
  await getOrSetUser();
  document.addEventListener('submit', handleSubmit);
  client.service('messages').on('created', addMessage);
  client.service('users').on('created', user => handleUser(user, true));
  client.service('users').on('patched', user => handleUser(user, true));

  // Show the last message first, add all the messages
  const messages = await client.service('messages').find({
    query: {
      $sort: { createdAt: -1 },
      $limit: 200,
    },
  });
  messages.data.reverse().forEach(addMessage);

  // Set up the user list
  const users = await client.service('users').find({
    query: {
      _id: {
        $ne: '__usernum__',
      },
      online: true,
      $limit: 200,
    },
  });
  users.data.forEach(user => handleUser(user, false));

  window.addEventListener('beforeunload', leavePage);
  addSystemMessage(`Welcome to the chat! You are ${user.name}.`);

  document.getElementById('toggle-userlist').addEventListener('click', toggleUserList);
};

let user;

const getOrSetUser = async () => {
  const cookieUser = Cookies.get('chat_user');

  // If there is no user cookie, create a new user
  if (cookieUser === undefined) {
    setUser(await client.service('users').create({ online: true }));
    return;
  }

  try { // Try to get the previous user
    const previousUser = await client.service('users').get(cookieUser);
    setUser(previousUser);
    await client.service('users').patch(user._id, { online: true });
  } catch (e) { // If the previous user fails, create a new user
    setUser(await client.service('users').create({ online: true }));
  }
};

const setUser = newUser => {
  user = newUser;
  const title = document.getElementById('chat-title');
  title.innerHTML = 'You are ' + user.name;
  Cookies.set('chat_user', newUser._id);
};

const handleSubmit = async event => {
  // Return if we're not sending a message
  if (event.target.id !== 'send-message') {
    return;
  }

  // Get the message text input field
  const input = document.querySelector('[name="text"]');

  // Don't actually submit
  event.preventDefault();

  // Send the message if it wasn't a command
  if (!(await handleCommands(input.value))) {
    await client.service('messages').create({
      text: input.value,
      user: user._id,
    });
  }

  // Reset the input field
  input.value = '';
};

const addMessage = message => {
  const chat = document.getElementById('chat');
  const time = moment(message.createdAt).format('HH:mm');
  const sender = message.user;
  const isUser = usersEqual(sender, user) ? 'user' : '';

  const messageHTML = `<span class="message ${isUser}">
        <span class="time">${time}</span>
        <span class="text">
          <span style="color: #${sender.color}">${sender.name}</span>: ${message.text}
        </span>
      </span>`;
  chat.insertAdjacentHTML('beforeend', messageHTML);
  scrollToBottom(chat);
};

const handleUser = (newUser, showJoinMessage = false) => {
  if (!newUser.online) {
    removeUser(newUser);
    return;
  }

  // Get the user list and potential old user node
  const userlist = document.getElementById('userlist');
  const oldUser = document.getElementById(newUser._id);

  // Generate the user node
  let isUser = '';
  if (usersEqual(newUser, user)) {
    isUser = 'user';
  }
  const userHTML =
    `<span id="${newUser._id}" class="${isUser}" style="color: #${newUser.color}">${newUser.name}</span>`;
  const template = document.createElement('template');
  template.innerHTML = userHTML;
  const userNode = template.content.cloneNode(true);

  // If oldUser existed replace it, otherwise append the newuser
  if (oldUser !== null) {
    userlist.replaceChild(userNode, oldUser);
  } else {
    userlist.insertAdjacentHTML('beforeend', userHTML);

    if (showJoinMessage) {
      addSystemMessage(`${newUser.name} has joined the chat.`);
    }
  }
  scrollToBottom(userlist);
};

const leavePage = async () => {
  // Set user as offline when leaving page
  socket.emit('patch', 'users', user._id, { online: false }, () => { /* Noop */ });
};

const handleCommands = async text => {
  // Return if it's not a command
  if (text[0] !== '/') {
    return false;
  }

  const sliceEnd = text.indexOf(' ');
  let command;
  let arg = '';
  if (sliceEnd === -1) {
    command = text.slice(1);
  } else {
    command = text.slice(1, sliceEnd);
    arg = text.slice(text.indexOf(' ') + 1);
  }

  switch (command) {
  case 'nick':
    try {
      const newUser = await client.service('users').patch(user._id, { name: arg });
      addSystemMessage(`Username successfully changed to: ${arg}.`);
      setUser(newUser);
    } catch (e) {
      let errorMessage;
      if (e.data && e.data[0]) {
        errorMessage = `Error changing username: ${e.data[0].message}`;
      } else {
        errorMessage = `Error changing username: ${e.message}`;
      }

      addSystemMessage(errorMessage);
    }
    break;
  case 'nickcolor':
    try {
      await client.service('users').patch(user._id, { color: arg });
      addSystemMessage('User color successfully changed.');
    } catch (e) {
      let errorMessage;
      if (e.data && e.data[0]) {
        errorMessage = `Error changing user color: ${e.data[0].message}`;
      } else {
        errorMessage = `Error changing user color ${e.message}`;
      }

      addSystemMessage(errorMessage);
    }
    break;
  case 'clear-system': {
    const systemMessages = document.querySelectorAll('.system-message');
    systemMessages.forEach(elem => elem.remove());
    break;
  }
  default:
    addSystemMessage(`Unknown command: "${command}"`);
  }

  return true;
};

function usersEqual(u1, u2) {
  return u1._id === u2._id;
}

function scrollToBottom(element) {
  element.scrollTop = element.scrollHeight;
}

function removeUser(maybeUser) {
  const user = document.getElementById(maybeUser._id);
  if (user !== null) {
    user.remove();

    if (!user.online) {
      addSystemMessage(`${maybeUser.name} has left the chat.`);
    }
  }
}

function addSystemMessage(messageText) {
  const chat = document.getElementById('chat');

  const messageHTML = `<span class="message system-message">${messageText}</span>`;
  chat.insertAdjacentHTML('beforeend', messageHTML);
  scrollToBottom(chat);
}

function toggleUserList() {
  const userlist = document.getElementById('userlist');
  const arrow = document.querySelector('#toggle-userlist > i');
  const button = document.getElementById('toggle-userlist');

  if (userlist.classList.contains('mobile-hidden')) {
    userlist.classList.remove('mobile-hidden');
    arrow.classList.remove('left');
    button.classList.remove('padding-arrow-left');
    arrow.classList.add('right');
    button.classList.add('padding-arrow-right');
  } else {
    userlist.classList.add('mobile-hidden');
    arrow.classList.remove('right');
    button.classList.remove('padding-arrow-right');
    arrow.classList.add('left');
    button.classList.add('padding-arrow-left');
  }
}

setup();