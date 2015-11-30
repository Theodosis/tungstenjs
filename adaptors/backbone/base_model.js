/**
 * Base Model - Provides generic reusable methods that child models can inherit from
 */
'use strict';
var _ = require('underscore');
var Backbone = require('backbone');
var backboneNested = require('./backbone_nested');
var tungsten = require('../../src/tungsten');
var logger = require('../../src/utils/logger');

var ComponentWidget = require('./component_widget');

/**
 * BaseModel
 *
 * @constructor
 * @class BaseModel
 */
var BaseModel = Backbone.Model.extend({
  tungstenModel: true,
  initialize: function(attributes, options) {
    /* develblock:start */
    this.initDebug();
    /* develblock:end */
    var derived = _.result(this, 'derived');
    var relations = _.result(this, 'relations') || {};
    if (derived) {
      var self = this;
      _.each(derived, function(props, name) {
        // Check if a collection relation is declared
        var isCollection = false;
        if (relations[name] && relations[name].tungstenCollection) {
          isCollection = true;
        }
        if (props.fn && props.deps) {
          var fn = _.bind(props.fn, self);
          var update = isCollection ? function() {
            self.getDeep(name).reset(fn());
          } : function() {
            self.set(name, fn());
          };
          _.each(props.deps, function(dep) {
            self.listenTo(self, 'change:' + dep, update);
            self.listenTo(self, 'update:' + dep, update);
            self.listenTo(self, 'reset:' + dep, update);
          });
          // Sets default value
          update();
        }
      });
    }
    this.attachComponents();
    this.postInitialize(attributes, options);
  },

  attachComponents: function() {
    // Bubble whitelisted events from components
    _.each(this.attributes, function(attr) {
      if (ComponentWidget.isComponent(attr)) {
        if (attr.model &&
          attr.model.constructor &&
          attr.model.constructor.prototype &&
          attr.model.constructor.prototype.exposedEvents) {
          _.each(attr.model.constructor.prototype.exposedEvents, function(event) {
            self.listenTo(attr.model, event, function() {
              var args = Array.prototype.slice.call(arguments);
              self.trigger.apply(self, [event].concat(args));
            });
          });
        }
      }
    });
  },

  /* develblock:start */

  /** @type {string} Override cidPrefix to avoid confusion with Collections */
  cidPrefix: 'model',

  /**
   * Bootstraps all debug functionality
   */
  initDebug: function() {
    tungsten.debug.registry.register(this);
    _.bindAll(this, 'getDebugName', 'getChildren');
  },

  /**
   * Debug name of this object, using declared debugName, falling back to cid
   *
   * @return {string} Debug name
   */
  getDebugName: function() {
    return this.constructor.debugName ? this.constructor.debugName + this.cid.replace('model', '') : this.cid;
  },

  /**
   * Gets children of this object
   *
   * @return {Array} Whether this object has children
   */
  getChildren: function() {
    var results = [];
    var self = this;
    _.each(this.relations, function(constructor, key) {
      if (self.has(key)) {
        results.push(self.get(key));
      }
    });
    return results;
  },

  /**
   * Get a list of all trackable functions for this view instance
   * Ignores certain base and debugging functions
   *
   * @param  {Object}        trackedFunctions     Object to track state
   * @param  {Function}      getTrackableFunction Callback to get wrapper function
   *
   * @return {Array<Object>}                      List of trackable functions
   */
  getFunctions: function(trackedFunctions, getTrackableFunction) {
    // Debug functions shouldn't be debuggable
    var blacklist = {
      constructor: true,
      initialize: true,
      set: true,
      postInitialize: true,
      initDebug: true,
      getFunctions: true,
      getVdomTemplate: true,
      isParent: true,
      getChildren: true,
      getDebugName: true
    };
    var getFunctions = require('../shared/get_functions');
    return getFunctions(trackedFunctions, getTrackableFunction, this, BaseModel.prototype, blacklist);
  },

  /**
   * Get array of attributes, so it can be iterated on
   *
   * @return {Array<Object>} List of attribute key/values
   */
  getPropertiesArray: function() {
    var properties = [];
    var relations = _.result(this, 'relations') || {};
    var derived = _.result(this, 'derived') || {};

    var isEditable = function(value) {
      if (!_.isObject(value)) {
        return true;
      } else if (_.isArray(value)) {
        var result = true;
        _.each(value, function(i) {
          result = result && isEditable(i);
        });
        return result;
      } else {
        try {
          JSON.stringify(value);
          return true;
        } catch (ex) {
          return false;
        }
      }
    };

    _.each(this.attributes, function(value, key) {
      var prop;
      if (relations && relations[key]) {
        prop = {
          key: key,
          data: {
            isRelation: true,
            name: value.getDebugName()
          }
        };
      } else {
        prop = {
          key: key,
          data: {
            isDerived: !!derived[key],
            isEditable: isEditable(value),
            isEditing: false,
            value: value
          }
        };

        prop.data.displayValue = prop.data.isEditable ? JSON.stringify(value) : Object.prototype.toString.call(value);
      }
      properties.push(prop);
    });

    properties = _.sortBy(properties, 'key');

    return properties;
  },
  /* develblock:end */

  // Empty default function
  postInitialize: function() {}
}, {
  extend: function(protoProps, staticProps) {
    /* develblock:start */
    // Certain methods of BaseModel should be unable to be overridden
    var methods = ['initialize'];

    function wrapOverride(first, second) {
      return function() {
        first.apply(this, arguments);
        second.apply(this, arguments);
      };
    }
    for (var i = 0; i < methods.length; i++) {
      if (protoProps[methods[i]]) {
        var msg = 'Model.' + methods[i] + ' may not be overridden';
        if (staticProps && staticProps.debugName) {
          msg += ' for model "' + staticProps.debugName + '"';
        }
        logger.warn(msg);
        // Replace attempted override with base version
        protoProps[methods[i]] = wrapOverride(BaseModel.prototype[methods[i]], protoProps[methods[i]]);
      }
    }
    /* develblock:end */

    return Backbone.Model.extend.call(this, protoProps, staticProps);
  }
});

// Add nested collection/model support with backbone_nested.
// To use, set a hash of relations on a model.
// See backbone_nested_spec for examples.
backboneNested.setNestedModel(BaseModel);

module.exports = BaseModel;
