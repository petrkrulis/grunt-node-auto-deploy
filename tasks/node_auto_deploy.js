/*
 * grunt-node-auto-deploy
 * https://github.com/petrkrulis.cz/grunt-node-auto-deploy
 *
 * Copyright (c) 2014 Petr Krulis
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  grunt.registerMultiTask('deploy', 'Automatic deployment of your node apps via grunt to nginx-upstart server.', function() {
    var options = this.options();

    var deploy = require('../lib/deploy');
    
    // Print deploying message.
    console.log('Deploying ' + options.branch + ' ' + 'to ' + options.ssh + ':' + options.path + '/' + options.url);
    
    // Run deployment
    deploy.run(options);
    
    // Print a success message.
    grunt.log.writeln('Deployed');
  });
};
