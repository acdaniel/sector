/*
 * inspiration and some code borrowed from
 * http://krasimirtsonev.com/blog/article/A-modern-JavaScript-router-in-100-lines-history-api-pushState-hash-url
 * and from Backbone.Router https://github.com/jashkenas/backbone
 */

var Component = require('../component'),
    utils = require('../utils');

var optionalParam = /\((.*?)\)/g;
var namedParam    = /(\(\?)?:\w+/g;
var splatParam    = /\*\w+/g;
var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

var Router = Component.define({
  type: 'router',
  defaults: {
    mode: 'history',
    root: '/',
    routeTopic: 'ui.routeChanged',
    backRequestTopic: 'ui.navigateBackRequested',
    forwardRequestTopic: 'ui.navigateForwardRequested',
    navigateRequestTopic: 'ui.navigateRequested',
    uiReadyTopic: 'ui.ready'
  },
  initialize: function (options) {
    if (!history.pushState) { this.mode = 'hash'; }
    if (this.root !== '/') {
      this.root = '/' + this._clearSlashes(options.root) + '/';
    }
    this.routes = {};
    if (options.routes) {
      for (var name in options.routes) {
        this.addRoute(name, options.routes[name]);
      }
    }
    this.subscribe(this.navigateRequestTopic, this._handleNavigateRequest);
    this.subscribe(this.backRequestTopic, this._handleBackRequest);
    this.subscribe(this.forwardRequestTopic, this._handleForwardRequest);
    this.listenTo(window, 'hashchange', this._handleHashChange);
    this.subscribe(this.uiReadyTopic, function () {
      var msg = this._parseFragment(this.getFragment());
      this.publish(this.routeTopic, msg);
    });
  },
  addRoute: function (name, route) {
    route = route.replace(escapeRegExp, '\\$&')
      .replace(optionalParam, '(?:$1)?')
      .replace(namedParam, function(match, optional) {
        return optional ? match : '([^/?]+)';
      })
      .replace(splatParam, '([^?]*?)');
    var regex = new RegExp('^' + route + '(?:\\?([\\s\\S]*))?$');
    this.trace('adding named route: ' + name, regex);
    this.routes[name] = regex;
  },
  getFragment: function () {
    var fragment = '', match;
    if (this.mode === 'history') {
      fragment = this._clearSlashes(decodeURI(location.pathname + location.search));
      fragment = fragment.replace(/\?(.*)$/, '');
      fragment = this.root !== '/' ? fragment.replace(this.root, '') : fragment;
    } else {
      match = window.location.href.match(/#(.*)$/);
      fragment = match ? match[1] : '';
    }
    return fragment;
  },
  _parseFragment: function (fragment) {
    this.trace('parsing fragment ' + fragment);
    for (var name in this.routes) {
      var route = this.routes[name];
      this.trace('eval route ' + name, route);
      var params = route.exec(fragment);
      if (params) {
        params = params.slice(1);
        return {
          name: name,
          path: fragment,
          params: utils.map(params, function(param, i) {
            // Don't decode the search params.
            if (i === params.length - 1) { return param || null; }
            return param ? decodeURIComponent(param) : null;
          })
        };
      }
    }
    return {};
  },
  _clearSlashes: function(path) {
    return path.toString().replace(/\/$/, '').replace(/^\//, '');
  },
  _handleHashChange: function () {
    var fragment, msg;
    fragment = this.getFragment();
    msg = this._parseFragment(fragment);
    this.publish(this.routeTopic, msg);
  },
  _handleNavigateRequest: function (msg) {
    var path = msg.data ? msg.data : '';
    if(this.mode === 'history') {
      history.pushState(null, null, this.root + this._clearSlashes(path));
    } else {
      window.location.href.match(/#(.*)$/);
      window.location.href = window.location.href.replace(/#(.*)$/, '') + '#' + path;
    }
    var outMsg = this._parseFragment(path);
    this.publish(this.routeTopic, outMsg);
  },
  _handleBackRequest: function () {
    var fragment, msg;
    window.history.back();
    fragment = this.getFragment();
    msg = this._parseFragment(fragment);
    this.publish(this.routeTopic, msg);
  },
  _handleForwardRequest: function () {
    var fragment, msg;
    window.history.forward();
    fragment = this.getFragment();
    msg = this._parseFragment(fragment);
    this.publish(this.routeTopic, msg);
  }
});

module.exports = Router;