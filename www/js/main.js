define(['jquery', 'socket.io', 'base/find', 'base/autoset', 'base/utils',
  'base/geo', 'nunjucks', 'templates'],
  function ($, io, find, Autoset, utils, geo, nunjucks, templates) {
  'use strict';

  var wrapper = $('#wrapper');

  var inResults = false;
  var socketUrl = location.hash.indexOf('dev') === -1 ?
    'http://clark-fifi.herokuapp.com/' :
    'http://127.0.0.1:5000';
  var socket = io.connect(socketUrl);
  var lastEngine;
  var lastTerm;

  var autoset = new Autoset();

  nunjucks.configure('/templates', { autoescape: true });

  // Listen for data from server and convert to module events
  socket.on('api/suggestDone', function (data) {
    console.log('GOT api/suggestDone: ', data);
    socket.emit('api/suggestDone/' + data.engineId, data);

    var results = data.result;

    if (results === 'undefined') {
      nunjucks.render('results.html', {
        engineSet: {},
        found: 0
      }, function (err, res) {
        wrapper.find('.suggestions').append(res);
      });
    } else {
      autoset.generate(results, data.engineId, function () {
        nunjucks.render('results.html', {
          engineSet: autoset.engines,
          found: utils.keySize(autoset.engines)
        }, function (err, res) {
          wrapper.find('.suggestions').html(res);
        });
      });
    }
  });

  socket.on('api/queryDone', function (data) {
    console.log('GOT api/queryDone: ', data);

    var engine = autoset.engines[lastEngine];

    for (var i = 0; i < engine.concepts.length; i ++) {
      if (engine.concepts[i].concept === data.term) {
        nunjucks.render('result.html', {
          engineId: data.engineId
        }, function (err, res) {
          wrapper.find('#details').append(res);

          switch (data.engineId) {
            case 'google.com':
              console.log(data.result.items[0].snippet)
              wrapper.find('#details li[data-engine="' + data.engineId + '"] .content')
                     .text(data.result.items[0].snippet);
              break;

            default:
              break;
          };
        });

        break;
      }
    }
  });

  // Load initial search template
  nunjucks.render('suggest.html', function (err, res) {
    wrapper.find('#suggestions').html(res);
  });

  wrapper.on('keyup', '#fifi-find', function (ev) {
    ev.preventDefault();
    autoset.results = {};

    var value = $(ev.target).val().toString();

    autoset.engineClear();
    wrapper.find('.suggestions').empty();

    if (value.length > 0) {
      lastTerm = value;
      setTimeout(function () {
        socket.emit('api/find', { term: value, location: geo.getLastLocation() });
      }, 1);
    } else {
      wrapper.find('.suggestions').empty();
    }
  });

  wrapper.find('#fifi-find').one('focus', function () {
    wrapper.find('#fifi-find-box')
           .addClass('fifi-find-box-focused')
           .find('#geolocation-box')
           .addClass('geolocation-box-focused');
    geo.startWatchingPosition(wrapper.find('#geolocation-name'));
  });

  function goBack() {
    wrapper.find('#details').hide();
    wrapper.find('#suggestions').show();
    // reset original search terms
    wrapper.find('#fifi-find').val(lastTerm);
    inResults = false;
  }

  wrapper.find('#fifi-find').on('focus', function () {
    if (inResults) {
      goBack();
    }
  });

  // on N+1 runs, if we've already successfully gotten their location
  // lets just go ahead and grab it again.  there's no real API to know
  // that our site has been granted the location permission
  if (geo.haveGeolocationPermission()) {
    geo.startWatchingPosition(wrapper.find('#geolocation-name'));
  }

  wrapper.on('touchstart click', function (ev) {
    var self = $(ev.target);

    switch (self.data('action')) {
      case 'concept':
        wrapper.find('#suggestions').hide();
        lastEngine = self.data('engine');
        // save the current terms
        lastTerm = wrapper.find('#fifi-find').val();
        // set suggested terms as current
        wrapper.find('#fifi-find').val(self.data('term'));

        for (var engine in autoset.engines) {
          socket.emit('api/query', {
            term: self.data('term'),
            location: geo.getLastLocation(),
            engineId: engine
          });
        }

        nunjucks.render('details.html', { term: self.data('term') }, function (err, res) {
          inResults = true;
          wrapper.find('#details').html(res).show();
        });
        break;

      case 'back':
        goBack();
        break;

      case 'geolocation':
        if (!geo.isWatchingPosition()) {
          geo.startWatchingPosition(wrapper.find('#geolocation-name'));
        } else {
          geo.stopWatchingPosition();
        }
        break;
    }
  });
});
