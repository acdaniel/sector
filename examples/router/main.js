/* global sector */

sector.Component.define({
  type: 'Navigator',
  ui: {
    back: '.back-button',
    foward: '.forward-button',
    randomRoute: '.random-route-button',
    paramRoute: '.param-route-button'
  },
  events: {
    'back.click': 'handleBackClick',
    'foward.click': 'handleForwardClick',
    'randomRoute.click': 'handleRandomRouteClick',
    'paramRoute.click': 'handleParamRouteClick'
  },
  initialize: function () {
    this.subscribe('ui.routeChanged', function (msg) {
      console.log(msg);
    });
  },
  handleBackClick: function () {
    this.publish('ui.navigateBackRequested');
  },
  handleForwardClick: function () {
    this.publish('ui.navigateForwardRequested');
  },
  handleRandomRouteClick: function () {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for( var i=0; i < 5; i++ ) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    this.publish('ui.navigateRequested', '/' + text);
  },
  handleParamRouteClick: function () {
    this.publish('ui.navigateRequested', '/abc/xyz/123/987?asdf=qwer');
  }
}, sector.mixins.View);

sector.components.Router.attachTo(document, {
  debug: true,
  mode: 'history',
  root: '/routing.html',
  routes: {
    abc: '/abc/:foo/123/:bar'
  }
});

sector.init();