/**
 * <%= pkg.name %> v<%= pkg.version %>
 * <%= pkg.description %>
 * <%= pkg.homepage %>
 *
 * Copyright 2014 <%= pkg.author %>
 * Released under the <%= pkg.license %> license
 *
 * Date: <%= date %>
 */
(function(global, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['lodash', 'jquery', 'exports'], function(_, $, exports) {
      global.sector = factory(global, exports, _, ($ || global.jQuery || global.$));
    });
  } else if (typeof exports !== 'undefined') {
    var _ = require('lodash'), $;
    try { $ = require('jquery'); } catch (e) { }
    factory(global, exports, _, ($ || global.jQuery || global.$));
  } else {
    global.sector = factory(global, {}, global._, (global.jQuery || global.$));
  }
}(this, function(global, sector, _, $) {

  <%= contents %>

  return sector;

}));