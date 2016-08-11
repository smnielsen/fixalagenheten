const notifier = require('node-notifier');
const axios = require('axios');
const path = require('path');
const { exec } = require('child_process');
const open = require('open');


const sites = [
  'Wåhlins Fastigheter'
];

const config = {
  TITLE: 'Fixa Lägenheter',
  /* Check wåhlins every weekday betweeb 13:00 - 13:40 */
  WAHLIN: {
    url: 'http://wahlinfastigheter.se/lediga-objekt/lagenhet/',
    startDay: 1,
    endDay: 5,
    startHour: 13,
    endHour: 13,
    startMinute: 0,
    endMinute: 35
  }
};

/**************************
 * Send notifications
 **************************/
const notifications = (function(){
  return {
    send: (subtitle, message, { wait = false, sound = false } = {}) => {
      return new Promise((resolve) => {
        console.log(`****** NOTIFY *****\n${config.TITLE}\n${subtitle}\n${message}\n********************`);
        notifier.notify({
          title: config.TITLE,
          message: '- ' + message,
          subtitle: subtitle,
          contentImage: '', //path.join(__dirname, 'apartment-icon.png'), // Absolute path (doesn't work on balloons)
          sound: sound, // Only Notification Center or Windows Toasters
          wait: wait // Wait with callback, until user action is taken against notification
        }, function (err, response) {
          // Response is response from notification
          resolve({ clicked: response === 'clicked' || response === 'activate', timeout: response === 'timeout' });
        });
      });
    }
  };
}());

/**************************
 * wahlinfastigheter
 **************************/
let defaultWahlinPageLength = 0,
    lastPageLength = 0,
    foundApartments = 0,
    started = false;
function checkWahlins({ day = 0, hour = 0, minute = 0 } = {}) {
  let { url, startDay, endDay, startHour, endHour, startMinute, endMinute } = config.WAHLIN;
  let W_TITLE = `${hour}:${minute.toString().length > 1 ? minute : '0' + minute} - Wåhlins Fastigheter`;

  function sendNotification(message, options) {
    return notifications.send(W_TITLE, message, options);
  }

  let fetching = false;
  function fetchPageAndCheckPageLength() {
    if(fetching) { return; }
    fetching = true;
    return new Promise((resolve, reject) => {
      exec(`curl -s ${url} | wc -c`, // command line argument directly in string
        function (error, stdout, stderr) {      // one easy function to capture data/errors
          fetching = false;
          try {
            let length = parseInt(stdout.trim());
            resolve(length);
          } catch(e) {
            console.error(e);
            reject();
          }
      });
    });
  }

  if(day >= startDay && day <= endDay &&
    hour >= startHour && hour <= endHour &&
    minute >= startMinute && minute < endMinute) {
    /* Time to check wåhlins */
    fetchPageAndCheckPageLength().then((length) => {
      if(defaultWahlinPageLength === 0) {
        console.log('Wåhlin Fastigheter - Setting default length to: ' + length);
        defaultWahlinPageLength = length;
      }

      let pageDiff = length - defaultWahlinPageLength;
      if(defaultWahlinPageLength > 100 && pageDiff > 300 && length !== lastPageLength) {
        // Notify change
        foundApartments++;
        console.log(W_TITLE + ' - Something happened, length is now ' + length);
        sendNotification('Ny lägenhet har dykt upp, klicka för att öppna.', { sound: true, wait: true })
          .then(({ clicked, timeout }) => {
            if(clicked || timeout) {
              console.log('Opening ' + url);
              open(url);
            }
          });
      }
      lastPageLength = length;
    });

    if(!started) {
      started = true;
      // first check
      sendNotification(`Sidan är aktiverad till ${config.WAHLIN.endHour}:${config.WAHLIN.endMinute}`, { wait: true })
    }
  } else if(defaultWahlinPageLength === 0) {
    fetchPageAndCheckPageLength().then((length) => {
      console.log('Wåhlin Fastigheter - Setting default length to: ' + length);
      defaultWahlinPageLength = length
    });
  } else {
    if(started) {
      sendNotification(`(${foundApartments} hittade) - Sökningen slutförd för dagen.`, { wait: true });
      defaultWahlinPageLength = 0;
      lastPageLength = 0;
      foundApartments = 0;
      started = false;
    }
  }
}

/**************************
 * START SERVICE
 **************************/
let DEFAULT_INTERVAL = 60000;
var lastCheckedMinute = -1;
function getDateObject() {
  let date = new Date();
  let day = date.getDay(),
      hour = date.getHours(),
      minute = date.getMinutes();
  return { day, hour, minute };
}
let oDate = getDateObject();
console.log(`${oDate.hour}:${oDate.minute} - Starting service. Checking following sites: ` + sites.map((site) => '\n' + site));
console.log('--------------------------');

notifications.send('Startar tjänsten...', 'Tjänsten notifierar när den hittar något nytt.', { wait: true });
checkWahlins(getDateObject());
setInterval(() => {
  let date = new Date();
  let day = date.getDay(),
      hour = date.getHours(),
      minute = date.getMinutes();

  //console.log(`${day} - ${hour}:${minute}`);
  checkWahlins(getDateObject())
}, DEFAULT_INTERVAL);
