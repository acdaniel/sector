var utils = require('../utils');

module.exports = function () {

  this.listenTo = function (el, event, func) {
    var els = el;
    if (!func) {
      func = event;
      event = el;
      els = [this.el];
    }
    if (utils.isString(el)) {
      els = this.select(el);
    } else if (!utils.isArray(el) && !(el instanceof NodeList)) {
      els = [el];
    }
    func = utils.isString(func) ? this[func] : func;
    this._listeners = this._listeners || {};
    var createRemovedListener = function (el) {
      return function (event) {
        var e = event.target;
        if (!e || e instanceof Text) { return; }
        var eid;
        if (e === window) {
          eid = 'window';
        } else if (e === window.document) {
          eid = 'document';
        } else {
          eid = e.getAttribute('data-sector-eid');
        }
        if (this._listeners[eid]) {
          this.trace('element removed', e);
          this.stopListening(e);
        }
      };
    };
    var createListener = function () {
      return function (event) {
        this.trace && this.trace('<- ' + event.target + '.' + event.type);
        func.apply(this, arguments);
      };
    };
    for (var i = 0, l = els.length; i < l; i++) {
      var e = els[i];
      if (!e) { continue; }
      var eid;
      if (e === window) {
        eid = 'window';
      } else if (e === window.document) {
        eid = 'document';
      } else {
        eid = e.getAttribute('data-sector-eid');
      }
      if (!eid) {
        eid = utils.uniqueId('e');
        e.setAttribute('data-sector-eid', eid);
      }
      if (!this._listeners[eid]) {
        this._listeners[eid] = {};
        this._listeners[eid].DOMNodeRemoved = utils.bind(createRemovedListener(e), this);
        e.addEventListener('DOMNodeRemoved', this._listeners[eid].DOMNodeRemoved, false);
      }
      if (this._listeners[eid][event]) {
        e.removeEventListener(event, this._listeners[eid][event], false);
      }
      this._listeners[eid][event] = utils.bind(createListener(), this);
      this.trace && this.trace('<+> ' + e + '.' + event);
      e.addEventListener(event, this._listeners[eid][event], false);
    }
  };

  this.stopListening = function (el, event) {
    var els = el;
    if (arguments.length === 1 && utils.isString(el)) {
      event = el;
      els = [this.el];
    } else if (utils.isString(el)) {
      els = this.select(el);
    } else if (!utils.isArray(el) && !(el instanceof NodeList)) {
      els = [el];
    }
    for (var i = 0, l = els.length; i < l; i++) {
      var e = els[i];
      if (!e) { continue; }
      var eid;
      if (e === window) {
        eid = 'window';
      } else if (e === window.document) {
        eid = 'document';
      } else {
        eid = e.getAttribute('data-sector-eid');
      }
      if (!this._listeners || !this._listeners[eid]) { continue; }
      if (event && !this._listeners[eid][event]) { continue; }
      if (!event) {
        for (var ev in this._listeners[eid]) {
          this.trace && this.trace('<x> ' + e + '.' + ev);
          e.removeEventListener(ev, this._listeners[eid][ev]);
        }
      } else {
        this.trace && this.trace('<x> ' + e + '.' + event);
        e.removeEventListener(event, this._listeners[eid][event]);
        delete this._listeners[eid][event];
      }
      if (this._listeners[eid].length === 0) {
        delete this._listeners[eid];
      }
    }
  };

  this.before('destroy', function () {
    var el;
    for (var eid in this._listeners) {
      if (eid === 'window') {
        el = window;
      } else if (eid === 'document') {
        el = window.document;
      } else {
        el = window.document.querySelector('[data-sector-eid=' + eid + ']');
      }
      this.stopListening(el);
    }
  });
};