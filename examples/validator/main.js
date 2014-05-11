/* global sector, alert */
function Alertable () {

  this.clearAlerts = function () {
    var alerts = [].slice.call(this.selectAll('div.alert'));
    for (var i = alerts.length - 1; i >= 0; i--) {
      this.el.removeChild(alerts[i]);
    }
  };

  this.showAlert = function (msg) {
    var alert = sector.buildHtml({
      'div.alert': {
        '@': { style: 'opacity: 0;' },
        'span': msg,
        'a.close': { 'html': '&#735;' }
      }
    }).firstChild;
    this.el.insertBefore(alert, this.el.firstChild);
    this.listenTo(alert, 'click:close', function (event) {
      event.preventDefault();
      if (event.target.className === 'close') {
        sector.animate(1, 0, {
          duration: 200,
          easing: 'easeIn',
          step: function (progress, value) {
            alert.style.opacity = 1 - progress;
          },
          complete: function () {
            this.el.removeChild(alert);
          }
        }, this);
      }
    });
    sector.animate(0, 1, {
      duration: 200,
      easing: 'easeOut',
      step: function (progress, value) {
        alert.style.opacity = progress;
      }
    }, this);
  };

}

sector.Component.define({
  type: 'registration-form',
  ui: {
    firstName: 'input[name=firstName]',
    lastName: 'input[name=lastName]',
    email: 'input[name=email]'
  },
  events: {
    'submit': 'handleSubmit',
    'change @firstName': 'handleChange',
    'invalid @firstName': 'handleInvalid',
    'invalid @lastName': 'handleInvalid',
    'invalid @email': 'handleInvalid'
  },
  validation: {
    '@firstName': { required: true },
    '@lastName': { required: true },
    '@email': { email: true }
  },
  binding: {
    'input[name=firstName], span.firstName': {
      key: 'name.first',
      events: ['change', 'keyup']
    },
    'input[name=lastName], span.lastName': 'name.last',
    'input[name=email]': 'email'
  },
  handleSubmit: function (event) {
    event.preventDefault();
    this.clearAlerts();
    if (this.checkValidity()) {
      alert('SUCCESS: \n' + JSON.stringify(this.data));
    }
  },
  handleChange: function (event) {
    this.clearAlerts();
    if (!this.checkValidity(event.target.name)) {
      event.preventDefault();
    }
  },
  handleInvalid: function (event) {
    this.showAlert(event.target.name + ': ' + event.detail.message);
  }
}, sector.mixins.View, sector.mixins.Validator, sector.mixins.Bound, Alertable);

sector.init();
