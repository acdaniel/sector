Sector.js
======

### Overview

Sector is a lightweight Javascript library for creating modular, easily
maintainable, and scalable browser based applications.

The goals for Sector are simple:

- To be a lightweight library that doesn't force project structure or get in the
 way of other libraries or frameworks you may want to use. Including forcing the
  use of external dependencies like jQuery that may not be needed.

- To be as unobtrusive as possible when it comes to markup and any markup should
 be valid.

- To provide the maximum portability and testibility of components as possible.

### Core Concepts

Sector is based on three core concepts to meet the goals above:

#### Components

Sector components are independant, easily testable, and flexible "black boxes"
of functionality. Components can provide functionality to do anything from
manage a user interface to interact with REST APIs. By leveraging the strict
seperation of concerns that Sector's components provide, you are freed of the
memory issues that plague other popular frameworks. Components do not keep
references to other components and a component's lifecycle directly correlates
to that of the DOM node that it is attached to. Therefore, if something were to
remove a DOM node that a component is attached to, all listeners etc. are
unbound automatically and the component is dereferenced and ready for garbage
collection.

#### Publish/Subscribe

Directly referencing component instances within other components creates a tight
 coupling and breaks the "black box" paradigm. Therefore Sector uses an event
 based publish/subscribe pattern to allow components to communicate while
 remaining de-coupled. Components are able to subscribe to global events that
 other components publish.

For example, a data component may be responsible for loading a list of todos
from local storage. Once the list is loaded, the component "publishes" a message
with the topic `'data.todosLoaded'` with an array of all the todos. Another
component that is responsible for rendering the list of todos, "subscribes" to
the `'data.todosLoaded'` topic and will receive an array of todos to display.

The flexibility of the pub/sub pattern really becomes apparent when we want to
add another component that stores and retrieves the list of todos from a remote
data source like a REST API. As long as the REST data component publishes the
same topic of `'data.todosLoaded'`, no modifications need to be made to the
display component at all. In fact, both the local storage and the REST data
components can go on doing what they were meant to do.

#### Mixins

Sector's mixins provide an easy way to keep code module and focused on specific
concerns. Instead of creating a giant monolithic component that encompasses
everything whether you need for a specific instance or not, mixins allow you to
keep your code focused and easy to maintain.

For example, in the core Sector library there is a `View` mixin that provides
easy access to the DOM, easy event binding, and template based rendering. There
is also a `Bound` mixin that provides one-way and two-way binding of data to DOM
elements and their attributes. Knowing that there are "views" that don't have a
need for binding, we kept them seperate to make it easier to maintain. Since
you can use as many mixins as you want to add functionality to your components
and keep things simple and avoid the kitchen sink approach to development.

Installation
------------
Sector can be easily installed with [Bower](http://bower.io):

    > bower install sector

or through [npm](http://nmpjs.org):

    > npm install sector

Usage
-----
Sector supports standalone, AMD, and CommonJS deployment with
[Browserify](http://browserify.org).

### Standalone
To use as a standard standalone script installed via Bower:

    <script src="bower_components/sector/dist/sector.js"></script>

Sector doesn't have any external dependencies but if you are already using
[lodash](http://lodash.com/) in your project, you can save a few KBs by using
the *slim* version of Sector located in the dist directory.

    <script src="bower_components/sector/dist/sector.slim.js"></script>

Once the script has been included in your page the library will be available in
the global variable `sector`.

For an example see the [Hello World Example](examples/helloworld)

### AMD
The Bower installed script can also be used as an AMD module loaded via
[RequireJS](http://requirejs.org).

For an example see the
[RequireJS version of the Hello World Example](examples/requirejs).

### CommonJS
If Sector is installed via NPM, you can simply `require('sector')` in your
client-side javascript then compile with Bower as you would any other npm module.

Examples
--------
You can find some examples of the core Sector functionality in the
[examples](examples) directory.

A [TodoMVC](http://todomvc.com) example is also available at
[todomvc-sector](http://acdaniel.github.io/todomvc-sector)
([source](http://github.com/acdaniel/todomvc-sector)).

Extensions
----------

[sector-router](http://github.com/acdaniel/sector-router): an extension for the
Sector.js library that adds a router component and mixins to support route aware
components.

[sector-list](http://github.com/acdaniel/sector-list): an extension for the
Sector.js library that allows repeating and binding to a collection with
selection management.

Browser Support
---------------
Chrome, Safari, Firefox, Opera, IE 9+
