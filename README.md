Sector.js
======

Sector is a lightweight Javascript library for creating modular, easily maintainable, and scalable browser based applications.

Similiar to [Flight.js](http://flightjs.github.io/) in theory but different in structure. In fact, the project started off as an experiment/exercise with component based publish/subscribe UI development after stumbling on Flight.js.

*Development is still very early. Things will likely change in the future*

Installation
------------
Sector can be easliy installed with [Bower](http://bower.io):

    > bower install sector

or through [npm](http://nmpjs.org):

    > npm install sector

Sector supports standalone, AMD, and Node/CommonJS deployment with [Browserify](http://browserify.org).

To use as a standard standalone script:

    <script src="bower_components/sector/dist/sector.js"></script>

Sector doesn't have any external dependencies but if you are already using [lodash](http://lodash.com/) in your project, you can save a few KBs by using the *slim* version of Sector located in the dist directory.

Browser Support
---------------
Chrome, Safari, Firefox, Opera, IE 9+

Usage
-----
For the time being, take a look at the included [examples](./examples) to see how simple Sector is to use.

A [TodoMVC](http://todomvc.com) example is also available at [todomvc-sector](http://github.com/acdaniel/todomvc-sector).
