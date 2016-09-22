var path = require('path');
var spawn = require('child_process').spawn;
var util = require('util');
var fs = require('fs');
var ssh;

var grunt;
var settings;
var timeout;
var position;
var responseBuffer;
var readyLine;
var lastCommand;
var lastDescription;
var applicationPath;
var tempApplicationPath
var logState;
var nginxPath;
var commands;
var domains;
var aliases;
var letsencryptDomains;

var done;
var readyRegExp = new RegExp( /(\w)+@(.)+:(.)+/ );

var commonErrors = [ ' error ', 'error:', ' errors ', 'failed', 'fatal', 'unable', '[PM2][ERROR]' ];

var buildCommands = function() {
    
    commands = [];

    if ( settings.before && settings.before.length > 0 ) {
      settings.before.reverse();
      for ( var i = 0; i < settings.before.length; i++ ) {
        commands.unshift({
          command: settings.before[i],
          description: 'Running ' + settings.before[i],
          callback: function( output ) {
            if( !hasCommonErrors( output ) ) {
              next();
            } else {
              error( 'Error processing command.\nError: ' + output.join('\n'), false, next ); 
            }
          }
        });
      }
    }

    commands.push({
      command: '[ -d ' + settings.nginx + ' ] && echo true || echo false',
      description: 'Checking nginx path validity',
      callback: function( output ) {
        if( output[output.length - 1].indexOf( 'true' ) > -1 ) {
          next();
        } else {
          error( 'The nginx path ' + settings.nginx + ' is not valid.', true );
        }
      }
    });

    commands.push({
      command: 'grep -Fx "Host github.com" ~/.ssh/config',
      callback: function( output ) {
        if( output.length < 1) {
          processCommand({ command: 'echo -e "Host github.com\\n\\tStrictHostKeyChecking no\\n\\n" >> ~/.ssh/config', description: 'Writing SSH configuration' });
        } else {
          next();
        }
      }
    });

    commands.push({
      command: 'grep -Fx "Host bitbucket.org" ~/.ssh/config',
      callback: function( output ) {
        if( output.length < 1) {
          processCommand({ command: 'echo -e "Host bitbucket.org\\n\\tStrictHostKeyChecking no\\n\\n" >> ~/.ssh/config', description: 'Writing SSH configuration' });
        } else {
          next();
        }
      }
    });


    if(settings.getSSLCerts) {

      commands.push({
        command: '[ -d ' + '/etc/letsencrypt/live/' + settings.url + ' ] && echo true || echo false',
        description: 'Searching existing SSL certificates',
        callback: function( output ) {
          if( output[output.length - 1].indexOf( 'true' ) > -1 ) {
            next();// Maybe there is
          } else {
            next(1); // There is not any cert
          }
        }
      });

      commands.push({ // Check if existing cert is for the same se of domains
        command: 'cat /etc/letsencrypt/renewal/' + settings.url + '.conf | grep domains',
        callback: function( output ) {
          if( output[output.length - 1].toString().toLowerCase().indexOf(domains.join(', ')) > -1 ) {
            next(1);// Maybe there is
          } else {
            next();
          }
        }
      });

      commands.push({
        command: 'letsencrypt certonly -a webroot --agree-tos --renew-by-default --webroot-path=/var/www/html ' + letsencryptDomains,
        description: 'Obtaining new SSL certificates',
        callback: function( output ) {
          if( !hasCommonErrors( output ) ) {
            next();
          } else {
            error( 'Cannot obtain SSL certificates.\nError: ' + output.join('\n'), false, next ); 
          }
        }
      });
    }

    commands.push({
      command: 'mkdir -p ' + settings.path,
      description: 'Creating folders'
    });

    commands.push({
      command: 'rm -rf ' + tempApplicationPath
    });

    commands.push({
      command: 'mkdir -p ' + tempApplicationPath,
      description: 'Creating temporary folder'
    });

    commands.push({
      command: 'git clone --depth=1 -b ' + settings.branch + ' --single-branch ' + settings.git + ' ' + tempApplicationPath,
      description: 'Cloning git repository',
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot clone git repository.\nError: ' + output.join('\n'), false, next ); 
        }
      }
    });

    commands.push({
      command: 'cd ' + tempApplicationPath
    });

    commands.push({
      command: 'git checkout ' + settings.branch,
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot checkout git branch.\nError: ' + output.join('\n'), false, next ); 
        }
      },
      description: 'Checkouting git branch'
    });

    commands.push({
      command: 'npm install',
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot install node dependencies.\nError: ' + output.join('\n'), false, next ); 
        }
      },
      description: 'Installing node dependencies'
    });

    if ( settings.then && settings.then.length > 0 ) {
      for ( var i = 0; i < settings.then.length; i++ ) {
        commands.push({
          command: settings.then[i],
          description: 'Running ' + settings.then[i],
          callback: function( output ) {
            if( !hasCommonErrors( output ) ) {
              next();
            } else {
              error( 'Error processing command.\nError: ' + output.join('\n'), false, next ); 
            }
          }
        });
      }
    }


    if (settings.conf) {
      commands.push({
        command: 'echo ' + getNginx() + ' | cat > ' + nginxPath + '.tmp',
      });

      commands.push({
        command: 'base64 -d ' + nginxPath + '.tmp > ' + nginxPath,
        callback: function( output ) {
          if( !hasCommonErrors( output ) ) {
            next();
          } else {
            error( 'Cannot decode uploaded base64 nginx configuration.\nError: ' + output.join('\n'), false, next ); 
          }
        }
      });
    };


    commands.push({
      command: 'nginx -s reload',
      callback: function( output ) {
        if( !hasCommonErrors( output ) ) {
          next();
        } else {
          error( 'Cannot reload nginx.\nError: ' + output.join('\n'), false, next ); 
        }
      },
      description: 'Reloading nginx'
    });

    if (settings.conf) {
      commands.push({
        command: 'rm -f ' + nginxPath + '.tmp',
        description: 'Removing nginx temporary configurations'
      });
    };
    

    if(settings.useNode) {
      commands.push({
        command: 'pm2 stop ' + settings.name,
        description: 'Stopping pm2 application'
      });
    } else {
      commands.push({
        command: 'pm2 delete -s ' + settings.name,
        description: 'Deleting pm2 application'
      });
    }


    commands.push({
      command: 'rm -rf ' + applicationPath,
      description: 'Removing old application files'
    });

    commands.push({
      command: 'mv ' + tempApplicationPath + ' ' + applicationPath,
      description: 'Placing new application files'
    });
  
    
    if(settings.useNode) {
      commands.push({
        command: 'pm2 start ' + path.join(applicationPath, settings.index) + ' --name ' + settings.name,
        callback: function( output ) {
          if( !hasCommonErrors( output ) ) {
            next();
          } else {
            error( 'Cannot start pm2 application.\nError: ' + output.join('\n'), false, next ); 
          }
        },
        description: 'Starting pm2 application'
      });
    }


    commands.push({
      command: 'exit',
      callback: function() {
        next();
      },
      description: 'Closing connection'
    });
}

var start = function() {
  responseBuffer = '';
  lastCommand = '';
  lastDescription = '';
  logState = 0;
  readyLine = '';
  position = -1;
  
  // Generate paths
  applicationPath = path.join( settings.path, settings.url );
  tempApplicationPath = path.join( settings.path, settings.url + '.temp' );
  nginxPath = path.join( settings.nginx, settings.url + '.conf' );
  domains = [settings.url];
  aliases = [];
  letsencryptDomains = '-d ' + settings.url;

  if( settings.alias ) {
    if( Array.isArray( settings.alias ) ) {
      aliases = settings.alias;
    } else {
      aliases.push(settings.alias);
    }
    for (var i = 0; i < aliases.length; i++) {
      letsencryptDomains += ' -d ' + aliases[i];
      domains.push(aliases[i]);
    }
  }
  
  // Generate commands
  buildCommands();
  
  // Reset timeout
  resetTimeout();
  
  // Start SSH session
  ssh = spawn( 'ssh', ['-tt', '-o StrictHostKeyChecking=no', settings.ssh] );
  
  // Set encoding so output matches input and vice versa
  ssh.stdin.setEncoding( 'utf-8' );
  ssh.stdout.setEncoding( 'utf-8' );
  
  // Atach listeners
  ssh.stdout.on('data', function( data ) {
    data = data.toString();
    handleResponse( data );
  });
  
  ssh.stderr.on('data', function (data) {
    if(data.toString().toLowerCase().indexOf('connection') > -1 && data.toString().toLowerCase().indexOf('closed') > -1) {
      return;
    }
    error( 'Something went wrong. Error: ' + data.toString(), true );
  });
  
  ssh.on('close', function (code) {
    if (true) {
      next();
    } else {
      error( 'SSH connection closed.', true );
    }
  });
}

var handleResponse = function(data) {
  responseBuffer += data;
  var lines = responseBuffer.split( '\r' );
  
  // Check for password prompt
  if ( responseBuffer.toLowerCase().indexOf('password') > 0 && responseBuffer.indexOf(':') > 0 ) {
    grunt.log.warn( 'You need to setup SSH key login.\n' );
  } else {
    if ( readyLine ) {
      if ( lines[lines.length - 1].indexOf(readyLine) > -1 ) {
        var command = commands[position];
        lines.pop();
        if ( lines[0] == lastCommand ) lines.shift();
        if ( command.callback ) {
          command.callback( lines );
        } else {
          next();
        }
      }
      else {
        // Output is incomplete. Waiting...
      }
    } else {
      if ( readyRegExp.test(responseBuffer) ) {
        readyLine = String( lines[lines.length - 1] ).trim().split( ':' )[0];
        next();
      }
      else {
        // Readyline not found yet. Waiting...
      }
    }
  }
  
  resetTimeout();
}

var processCommand = function(holder) {
  var description = holder.description || '';
  var command = holder.command;
  
  if ( description && description != lastDescription) {
    grunt.log.writeln( description + '...' );
    logState = 1;
  }
  
  lastCommand = command;
  lastDescription = description;
  ssh.stdin.write( command + '\n');
}

var finalize = function( ok ) {
  ok = ok || false;
  
  try {
    // Detach listeners
    ssh.stdout.removeAllListeners( 'data' );
    ssh.stderr.removeAllListeners( 'data' );
    ssh.removeAllListeners( 'close' );
    
    // Stop timeout
    clearInterval(timeout);
    
    // Send exit command
    processCommand({
      command: 'exit'
    });
  } catch ( error ) {
    // We dont care
  }
  
  //Implement exit
  grunt.log.write( '\n' );
  done(ok);
}

var error = function( description, fatal, then ) {
  if( fatal ) {
    grunt.log.errorlns( 'Fatal error: ' + description );
    finalize( false );
  } else {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    grunt.log.warn( description );
    grunt.log.write('Do you want to continue execution (y/n)? : ');
    process.stdin.on('data', function (text) {
      if (text === 'y' || text === 'y\n' || text === 'yes\n') {
        then();
      } else {
        finalize( false );
      }
    });
  }
}

var next = function( skip ) {
  skip = skip || 0;
  position += skip + 1;
  
  if (logState > 0) {
    grunt.log.ok( 'DONE' );
    logState = 0;
  }
  
  if ( position >= commands.length ) {
    finalize( true );
    return;
  }
  
  responseBuffer = '';
  setTimeout(doCommand, 300);
}

var doCommand = function() {
  processCommand(commands[position]);
}

var resetTimeout = function() {
  clearTimeout( timeout );
  timeout = setTimeout( timeouted, 180000 );
}

var timeouted = function() {
  error( 'Request timeouted.', true );
}

var hasCommonErrors = function( output ) {
  if( typeof output === 'array' ) output = output.join( ' ' );
  output = output.toString().toLowerCase();
  
  for( var i = 0; i < commonErrors.length; i++ ) {
    if( output.indexOf(commonErrors[i]) > -1 && output.indexOf( 'without error' ) < 0 ) {
      return true;
    }
  }
  return false;
}

var getAliasConfig = function() {
  var config = '';
  var aliases = [];
  if( settings.alias ) {
    if( Array.isArray( settings.alias ) ) {
      aliases = settings.alias;
    } else {
      aliases.push(settings.alias);
    }
    for (var i = 0; i < aliases.length; i++) {
      config += '\n';
      config += 'server {\n';
      config += '  listen 80;\n';
      config += '  server_name ' + aliases[i] + ';\n';
      config += '  return 301 $scheme://' + settings.url + '$request_uri;\n';
      config += '}\n';
    }
  }
  return config;
}

// Generate script and encode it because of special chars like ';'
var getNginx = function() {

  if (settings.nginxConf) {

    var conf = fs.readFileSync(settings.nginxConf, 'utf8');
    conf = conf.replace(/{{url}}/gi, settings.url);
    conf = conf.replace(/{{port}}/gi, settings.port);
    conf = conf.replace(/{{domains}}/gi, domains.join(' '));
    conf = conf.replace(/{{aliases}}/gi, aliases.join(' '));
    conf = conf.replace(/{{ifNodejs}}/gi, (settings.useNode) ? '' : '#');
    conf = conf.replace(/{{!ifNodejs}}/gi, (settings.useNode) ? '#' : '');

    return new Buffer(conf).toString('base64');

  } else {
    return new Buffer('upstream ' + settings.url + ' {\n'
      + '  server 127.0.0.1:' + settings.port + ';\n'
      + '}\n\n'
      + 'server {\n'
      + '  listen 80;\n'
      + '  client_max_body_size 4G;\n'
      + '  server_name ' + settings.url + ';\n\n'
      + '  keepalive_timeout 5;\n\n'
      + '  location / {\n'
      + '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n'
      + '    proxy_set_header Host $http_host;\n'
      + '    proxy_set_header X-NginX-Proxy true;\n'
      + '    proxy_redirect off;\n'
      + '    proxy_pass http://localhost:' + settings.port + ';\n'
      + '    proxy_http_version 1.1;\n'
      + '    proxy_set_header Upgrade $http_upgrade;\n'
      + '    proxy_set_header Connection "upgrade";\n'
      + '  }\n'
      + '}\n' + getAliasConfig()).toString('base64');
  }
};


var run = function(options, callback, gruntObject) {
  done = callback;
  grunt = gruntObject;
  settings = options;
  start();
};

module.exports = {
  run: run
};