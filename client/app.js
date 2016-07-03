/* global window: false */

'use strict';

(function(win, doc) {
  var ajax = (function() {
    function respond(xhr, callback) {
      if (xhr.readyState !== 4) {
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        var data;

        if (xhr.responseText) {
          data = JSON.parse(xhr.responseText);
        }

        return callback(void(0), data);
      }

      callback({
        status: xhr.status,
        statusText: xhr.statusText
      });
    }

    function request(url, method, callback) {
      var xhr = new win.XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.onreadystatechange = function() {
        respond(xhr, callback);
      };
      return xhr;
    }

    return {
      get: function(url, callback) {
        request(url, 'GET', callback).send();
      },

      post: function(url, payload, callback) {
        request(url, 'POST', callback)
          .send(payload ? JSON.stringify(payload) : void(0));
      }
    };
  })();

  var endpoint = 'https://{{API-ID}}.execute-api.us-east-1.amazonaws.com/' +
    'dev/words';

  var word = doc.getElementById('word');
  var display = doc.getElementById('display');

  function add() {
    if (!word.value) {
      return;
    }

    display.textContent = 'Adding...';

    ajax.post(endpoint, {word: word.value}, function(err) {
      if (err) {
        display.textContent = 'ERROR';
        return;
      }

      display.textContent = 'Added';
    });
  }

  function count() {
    if (!word.value) {
      return;
    }

    var url = endpoint + '/' + encodeURIComponent(word.value);

    display.textContent = 'Counting...';

    ajax.get(url, function(err, data) {
      if (err) {
        display.textContent = 'ERROR';
        return;
      }
      display.textContent = data.counts.toString();
    });
  }

  doc.addEventListener('DOMContentLoaded', function() {
    doc.getElementById('add').addEventListener('click', add);
    doc.getElementById('count').addEventListener('click', count);
  });
  
})(window, window.document);
