/*
 * grunt-node-auto-deploy
 * https://github.com/petrkrulis.cz/grunt-node-auto-deploy
 *
 * Copyright (c) 2014 Petr Krulis
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
        '<%= nodeunit.tests %>'
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    // Configuration to be run (and then tested).
    node_auto_deploy: {
      default_options: {
        options: {
          url: 'gruntnodeautodeploy.test',
          alias: 'www.gruntnodeautodeploy.test',
          command: 'node server.js',
          port: '8070',
          path: '/var/www/sites',
          nginx: '/etc/nginx/sites-enabled',
          git: 'https://petrkrulis@bitbucket.org/petrkrulis/deploy-test.git',
          branch: 'master',
          ssh: 'root@nodejs',
          before: [
            'echo hello',
            'echo hello2',
            'echo hello3'
          ],
          then: [
            'grunt post'
          ]
        }
      },
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['node_auto_deploy']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);

};
