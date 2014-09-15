var utils = require('../utils');

module.exports = function Listener () {

  this.listenTo = function (el, event, func) {
    if (!func) {
      func = event;
      event = el;
      el = this.el;
    }
    if (utils.isString(el)) {
      el = this.select(el);
    }
    var eventParts = event.split(':', 2);
    var eventName = eventParts[0], eventNamespace = eventParts[1] || '_';
    func = utils.isString(func) ? this[func] : func;
    if (!func) {
      throw new Error(this + ' Error: Invalid handler for ' + el.toString() + '.' + event);
    }
    this._listeners = this._listeners || {};
    if (!el) { return; }
    var nodes;
    if (el instanceof NodeList) {
      nodes = [].slice.call(el);
    } else if (!Array.isArray(el)) {
      nodes = [el];
    } else {
      nodes = el;
    }
    nodes.forEach(function (node, index) {
      var eid;
      var listener = function (event) {
        if (this.trace) { this.trace('<- ' + event.target + '.' + event.type); }
        func.apply(this, arguments);
      };
      if (node === window) {
        eid = 'window';
      } else if (node === document) {
        eid = 'document';
      } else {
        eid = node.getAttribute('data-sector-eid');
      }
      if (!eid) {
        eid = utils.uniqueId('e');
        node.setAttribute('data-sector-eid', eid);
      }
      if (!this._listeners[eid]) {
        this._listeners[eid] = {};
      }
      if (!this._listeners[eid][eventNamespace]) {
        this._listeners[eid][eventNamespace] = {};
      }
      if (this._listeners[eid][eventNamespace][eventName]) {
        if (this.trace) { this.trace('<x> ' + node + '.' + eventName + ':' + eventNamespace); }
        node.removeEventListener(eventName, this._listeners[eid][eventNamespace][eventName], false);
      }
      this._listeners[eid][eventNamespace][eventName] = listener.bind(this);
      if (this.trace) { this.trace('<+> ' + node + '.' + eventName + ':' + eventNamespace); }
      node.addEventListener(eventName, this._listeners[eid][eventNamespace][eventName], false);
    }, this);
  };

  this.stopListening = function (el, event) {
    if (!event && utils.isString(el)) {
      event = el;
      el = this.el;
    }
    if (utils.isString(el)) {
      el = this.select(el);
    }
    if (!el) { return; }
    var nodes;
    if (el instanceof NodeList) {
      nodes = [].slice.call(el);
    } else if (!Array.isArray(el)) {
      nodes = [el];
    } else {
      nodes = el;
    }
    nodes.forEach(function (node, index) {
      var eid, en, ev;
      if (node === window) {
        eid = 'window';
      } else if (node === document) {
        eid = 'document';
      } else {
        eid = node.getAttribute('data-sector-eid');
      }
      if (!this._listeners || !this._listeners[eid]) { return; }
      if (!event) {
        for (en in this._listeners[eid]) {
          for (ev in this._listeners[eid][en]) {
            if (this.trace) { this.trace('<x> ' + el + '.' + ev + ':' + en); }
            node.removeEventListener(ev, this._listeners[eid][en][ev]);
            delete this._listeners[eid][en][ev];
          }
          delete this._listeners[eid][en];
        }
      } else {
        var eventParts = event.split(':', 2);
        var eventName = eventParts[0] || '*', eventNamespace = eventParts[1] || '*';
        if (eventNamespace === '*') {
          for (en in this._listeners[eid]) {
            for (ev in this._listeners[eid][en]) {
              if (ev === eventName) {
                if (this.trace) { this.trace('<x> ' + node + '.' + ev); }
                node.removeEventListener(ev, this._listeners[eid][en][ev]);
                delete this._listeners[eid][en][ev];
              }
            }
          }
        } else {
          if (event && !this._listeners[eid][eventNamespace]) { return; }
          for (ev in this._listeners[eid][eventNamespace]) {
            if (eventName === '*' || ev === eventName) {
              if (this.trace) { this.trace('<x> ' + node + '.' + ev); }
              node.removeEventListener(ev, this._listeners[eid][eventNamespace][ev]);
              delete this._listeners[eid][eventNamespace][ev];
            }
          }
          if (this._listeners[eid][eventNamespace].length === 0) {
            delete this._listeners[eid][eventNamespace];
          }
        }
      }
      if (this._listeners[eid].length === 0) {
        delete this._listeners[eid];
      }
    }, this);
  };

  this.before('destroy', function () {
    var el;
    for (var eid in this._listeners) {
      if (eid === 'window') {
        el = window;
      } else if (eid === 'document') {
        el = document;
      } else {
        el = document.querySelector('[data-sector-eid=' + eid + ']');
      }
      this.stopListening(el);
    }
  });
};
