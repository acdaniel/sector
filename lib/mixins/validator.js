var utils = require('../utils');

var validators;

module.exports = function Validator () {

  this.defaults = utils.defaults({}, this.defaults, {
    validation: null,
    invalidClassName: 'invalid',
    validityMessages: {
      required: 'Please enter a value for this field',
      min: 'Value must be greater than or equal to {0}',
      max: 'Value must be less than or equal to {0}',
      step: 'Value must be in increments of {0}',
      range: 'Value must be between {0} and {1}',
      length: 'Value must have a length of {0}',
      minlength: 'Value must be at least {0} characters long',
      maxlength: 'Value cannot be more that {0} characters long',
      rangelength: 'Value must be between {0} and {1} characters long',
      pattern: 'Please match the requested format',
      email: 'Please enter a valid email',
      url: 'Please enter a valid URL',
      numeric: 'Value must be numeric',
      alphanumeric: 'Value must contain letters and numbers only',
      alpha: 'Value must contain letters only'
    }
  });

  this.checkValidity = function (name) {
    var retVal = true;
    if (this.validation) {
      if (name) {
        return this.checkFieldValidity(name, this.validation[name]);
      } else {
        for (name in this.validation) {
          retVal = this.checkFieldValidity(name, this.validation[name]) && retVal;
        }
      }
    }
    return retVal;
  };

  this.checkFieldValidity = function (name, options) {
    var retVal = true, radios = [], radioValue, rule, nodes, node;
    if (name[0] === '@') {
      nodes = this.ui[name.substr(1)];
      if (!Array.isArray(nodes) && !(nodes instanceof NodeList)) {
        nodes = [nodes];
      }
    } else {
      nodes = this.selectAll('[name="' + name + '"]');
    }
    options = options || (this.validation ? this.validation[name] : {});

    if (nodes.length === 0) { return true; }

    var validate = function (rule, field, value, options) {
      if (rule === 'custom') {
        if (utils.isFunction(options)) {
          return options.call(this, node, value);
        } else {
          return this[options].call(this, node, value);
        }
      } else {
        return validators[rule].call(this, node, value, options);
      }
    }.bind(this);

    for (var i = 0, l = nodes.length; i< l; i++) {
      node = nodes[i];
      utils.removeClassName(node, 'invalid');
      if (node.type === 'radio') {
        radios.push(node);
        radioValue = node.checked ? node.value : null;
      } else {
        for (rule in options) {
          if (validate(rule, node, node.value, options[rule])) {
            retVal = true && retVal;
          } else {
            retVal = false;
            break;
          }
        }
      }
    }

    if (radios.length > 0) {
      for (rule in options) {
        if (validate(rule, radios, radioValue, options[rule])) {
          retVal = true && retVal;
        } else {
          retVal = false;
          break;
        }
      }
    }

    if (retVal) {
      this.setValidity(nodes, true);
    }

    return retVal;
  };

  this.setValidity = function (field, msg, rule, options) {
    var nodes, node, e, retVal;
    if (name[0] === '@') {
      nodes = this.ui[name.substr(1)];
      if (!Array.isArray(nodes) && !(nodes instanceof NodeList)) {
        nodes = [nodes];
      }
    } else if (utils.isString(field)) {
      nodes = [].slice.call(this.selectAll('[name="' + field + '"]'));
    } else if (utils.isElement(field)) {
      nodes = [field];
    } else if (utils.isArray(field)) {
      nodes = field;
    } else {
      nodes = [].slice.call(field);
    }
    for (var i = 0, l = nodes.length; i < l; i++) {
      node = nodes[i];
      if (msg === true) {
        utils.removeClassName(node, 'invalid');
        utils.addClassName(node, 'valid');
        e = utils.createEvent('valid');
        retVal = true;
      } else {
        utils.addClassName(node, 'invalid');
        e = utils.createEvent('invalid', { message: msg, rule: rule, options: options });
        retVal = false;
      }
      node.dispatchEvent(e);
    }
    return retVal;
  };

  this.formatValidityMessage = function (msg, args) {
    args = !utils.isArray(args) ? [args] : args;
    return msg.replace(/{{([0-9]+)}}/g, function (str, p1) {
      return args[p1];
    });
  };
};

validators = {
  required: function (field, value, options) {
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.required;
    if (options && ('undefined' === typeof value || value === null || utils.isEmpty(value))) {
      return this.setValidity(field, msg, 'required');
    }
    return true;
  },
  min: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { min: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.min;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value < options.min) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.min), 'min');
    }
    return true;
  },
  max: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { max: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.max;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value > options.max) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.max), 'max');
    }
    return true;
  },
  step: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { step: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.step;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && (value % options.step !== 0)) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.step), 'range');
    }
    return true;
  },
  range: function (field, value, options) {
    if (utils.isArray(options)) {
      options = { min: options[0], max: options[1] };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.range;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && (value < options.min || value > options.max)) {
      return this.setValidity(field, this.formatValidityMessage(msg, [options.min, options.max]), 'range');
    }
    return true;
  },
  length: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { length: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.length;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value.length !== options.length) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.length), 'length');
    }
    return true;
  },
  minlength: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { minlength: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.minlength;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value.length < options.minlength) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.minlength), 'minlength');
    }
    return true;
  },
  maxlength: function (field, value, options) {
    if ('object' !== typeof options) {
      options = { maxlength: options };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.maxlength;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && value.length > options.maxlength) {
      return this.setValidity(field, this.formatValidityMessage(msg, options.maxlength), 'maxlength');
    }
    return true;
  },
  rangelength: function (field, value, options) {
    if (Array.isArray(options)) {
      options = { min: options[0], max: options[1] };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.rangelength;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && (value.length < options.min || value.length > options.max)) {
      return this.setValidity(field, this.formatValidityMessage(msg, [options.min, options.max]), 'rangelength');
    }
    return true;
  },
  pattern: function (field, value, options) {
    if (utils.isString(options)) {
      options = { pattern: new RegExp(options) };
    } else if (options instanceof RegExp) {
      options = { pattern: options };
    }
    options.pattern = options.pattern instanceof RegExp ? options.pattern : new RegExp(options.pattern);
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.pattern;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !options.pattern.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'pattern');
    }
    return true;
  },
  url: function (field, value, options) {
    if ('object' !== typeof options) {
      options = {
        schemes: ['http', 'https', 'ftp'],
        requireTld: true,
        requireScheme: false
      };
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.url;
    var regex = new RegExp('^(?!mailto:)(?:(?:' + options.schemes.join('|') + ')://)' + (options.requireScheme ? '' : '?') + '(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))' + (options.requireTld ? '' : '?') + ')|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$', 'i');
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && (value.length > 2083 || !regex.test(value))) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'url');
    }
    return true;
  },
  email: function (field, value, options) {
    var regex = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?$/i;
    if ('object' !== typeof options) {
      options = {};
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.email;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !regex.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'email');
    }
    return true;
  },
  numeric: function (field, value, options) {
    var regex = /^-?[0-9]+$/;
    if ('object' !== typeof options) {
      options = {};
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.numeric;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !regex.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'numeric');
    }
    return true;
  },
  alphanumeric: function (field, value, options) {
    var regex = /^[a-zA-Z0-9]+$/;
    if ('object' !== typeof options) {
      options = {};
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.alphanumeric;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !regex.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'alphanumeric');
    }
    return true;
  },
  alpha: function (field, value, options) {
    var regex = /^[a-zA-Z]+$/;
    if ('object' !== typeof options) {
      options = {};
    }
    var msg = utils.has(options, 'message') ? options.message : this.validityMessages.alpha;
    if ('undefined' !== typeof value && value !== null && !utils.isEmpty(value) && !regex.test(value)) {
      return this.setValidity(field, this.formatValidityMessage(msg), 'alpha');
    }
    return true;
  }
};
