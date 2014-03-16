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
    'back.click': '_handleBackClick',
    'foward.click': '_handleForwardClick',
    'randomRoute.click': '_handleRandomRouteClick',
    'paramRoute.click': '_handleParamRouteClick'
  },
  initialize: function () {
    this.subscribe('ui.routeChanged', function (msg) {
      console.log(msg);
    });
  },
  _handleBackClick: function (event) {
    this.publish('ui.navigateBackRequested');
  },
  _handleForwardClick: function (event) {
    this.publish('ui.navigateForwardRequested');
  },
  _handleRandomRouteClick: function (event) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for( var i=0; i < 5; i++ ) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    this.publish('ui.navigateRequested', '/' + text);
  },
  _handleParamRouteClick: function (event) {
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