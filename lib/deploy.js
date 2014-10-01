var path = require('path');
var spawn = require('child_process').spawn;
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
var logState;
var nginxPath;
var upstartPath;
var commands;

var done;
var readyRegExp = new RegExp( /(\w)+@(.)+:(.)+/ );

var buildCommands = function() {
  commands = [
    {
      command: '[ -d ' + settings.nginx + ' ] && echo true || echo false',
      description: 'Checking nginx path validity',
      callback: function( output ) {
        if( output[output.length - 1].indexOf( 'true' ) > -1 ) {
          next();
        } else {
          error( 'The nginx path ' + settings.nginx + ' is not valid.' );
        }
      }
    },
    {
      command: 'grep -Fx "Host github.com" ~/.ssh/config',
      callback: function( output ) {
        if( output.length < 1) {
          processCommand({ command: 'echo -e "Host github.com\\n\\tStrictHostKeyChecking no\\n\\n" >> ~/.ssh/config', description: 'Writing SSH configuration' });
        } else {
          next();
        }
      }
    },
    {
      command: 'grep -Fx "Host bitbucket.org" ~/.ssh/config',
      callback: function( output ) {
        if( output.length < 1) {
          processCommand({ command: 'echo -e "Host bitbucket.org\\n\\tStrictHostKeyChecking no\\n\\n" >> ~/.ssh/config', description: 'Writing SSH configuration' });
        } else {
          next();
        }
      }
    },
    {
      command: 'mkdir -p ' + settings.path,
      description: 'Creating folders'
    },
    {
      command: 'stop ' + settings.url + ' > /dev/null',
      description: 'Stopping application'
    },
    {
      command: '[ -d ' + path.join( applicationPath, '.git' ) + ' ] && echo true || echo false',
      callback: function( output ) {
        if( output[output.length - 1].indexOf( 'true' ) > -1 ) {
          next(1);
        } else {
          next();
        }
      }
    },
    {
      command: 'git clone ' + settings.git + ' ' + applicationPath,
      description: 'cloning git repository',
      callback: function( output ) {
        var outputString = output.join(' ');
        if( outputString.indexOf( 'error' ) > -1 || outputString.indexOf( 'unable' ) > -1 || outputString.indexOf( 'fatal' ) > -1 ) {
          error( 'Cannot clone git repository.\nError: ' + outputString );
        } else {
          next();
        }
      }
    },
    {
      command: 'cd ' + applicationPath,
    },
    {
      command: 'git fetch',
      description: 'Fetching git repository'
    },
    {
      command: 'git branch ' + settings.branch + ' origin/' + settings.branch,
      description: 'Changing git branch'
    },
    {
      command: 'git checkout ' + settings.branch,
      description: 'Checkouting git branch'
    },
    {
      command: 'git pull origin ' + settings.branch,
      description: 'Pulling git branch'
    },
    {
      command: 'echo ' + getUpstart() + ' | cat > ' + upstartPath + '.tmp',
      description: 'Uploading configuration files'
    },
    {
      command: 'echo ' + getNginx() + ' | cat > ' + nginxPath + '.tmp',
    },
    {
      command: 'base64 -d ' + nginxPath + '.tmp > ' + nginxPath,
    },
    {
      command: 'base64 -d ' + upstartPath + '.tmp > ' + upstartPath,
    },
    {
      command: 'rm ' + nginxPath + '.tmp',
      description: 'Removing temporary files'
    },
    {
      command: 'rm ' + upstartPath + '.tmp'
    },
    {
      command: 'nginx -s reload',
      description: 'Restarting nginx'
    },
    {
      command: 'npm install',
      description: 'Installing nodejs dependencies'
    }
  ];
  
  if ( settings.then.length > 0 ) {
    for ( var i = 0; i < settings.then.length; i++ ) {
      commands.push({
        command: settings.then[i],
        description: 'Running ' + settings.then[i]
      });
    }
  }
  
  commands.push({
    command: 'start ' + settings.url,
    description: 'Starting server'
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
  nginxPath = path.join( settings.nginx, settings.url + '.conf' );
  upstartPath = path.join( '/etc/init', settings.url + '.conf' );
  
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
    error( 'Oh. Something went wrong. Error code is: ' + code.toString() );
  });
  
  ssh.on('close', function (code) {
    error( 'SSH exited prematurely with code ' + code.toString() );
  });
}

var handleResponse = function(data) {
  responseBuffer += data;
  var lines = responseBuffer.split( '\r' );
  
  // Check for password prompt
  if ( responseBuffer.indexOf('assword') > 0 && responseBuffer.indexOf(':') > 0 ) {
    // Ask for pass and send it
    console.log('password prompt detected - not implemented yet');
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
        // Readyline not found yet
      }
    }
  }
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

var error = function( description ) {
  grunt.log.errorlns( description );
  finalize( false );
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
  clearInterval( timeout );
  timeout = setTimeout( timeouted, 180000 );
}

var timeouted = function() {
  error( 'Request timeouted. Check your settings and run grunt again' );
}

// Generate script and encode it because of special chars like ';'
var getNginx = function() {
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
       + '}\n').toString('base64');
};

var getUpstart = function() {
  return new Buffer('description "' + settings.url + ' node process"\n\n'
       + 'start on runlevel [2]\n'
       + 'stop on runlevel [016]\n\n'
       + 'console owner\n'
       + 'chdir "' + settings.path + '/' + settings.url + '"\n'
       + 'env NODE_ENV=production\n'
       + 'exec ' + settings.command + ' >> /var/log/' + settings.url + '.log 2>&1\n'
       + 'respawn\n'
       + 'respawn limit 5 15\n').toString('base64');
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