(function () {
    'use strict';
    let express = require('express');
    let http = require('http');
    let app = module.exports = express();
    let server = http.createServer(app);
    let bodyParser = require('body-parser');
    let cookieParser = require('cookie-parser');
    let methodOverride = require('method-override');
    let io = require('socket.io');
    // .listen(server);
    let fs = require('fs');
    let eco = require('eco');
    let config = {};
    // io.settings['log level'] = 1;
    let Client = (function () {
        function Client(socket1) {
            this.socket = socket1;
        }
        Client.prototype.emit = function (eventType, payload) {
            return this.socket.emit(eventType, payload);
        };
        return Client;
    })();
    let Room = (function () {
        function Room(token1, top, bottom) {
            this.token = token1;
            this.top = top != null ? top : null;
            this.bottom = bottom != null ? bottom : null;
        }
        return Room;
    })();
    let rooms = [];
    let getRoom = function (token) {
        var j, len, room;
        for (j = 0, len = rooms.length; j < len; j++) {
            room = rooms[j];
            if (room.token === token) {
                return room;
            }
        }
    };
    let roomRoute = function (event, data, user) {
        var room;
        room = getRoom(data.token);
        if (room == null) {
            return;
        }
        if (room.top !== user && room.bottom !== user) {
            console.log('Incorrect user');
            return;
        }
        if (room.top === user && (room.bottom != null) && (room.bottom.socket != null)) {
            return room.bottom.socket.emit(event, data);
        } else if ((room.top != null) && (room.top.socket != null)) {
            return room.top.socket.emit(event, data);
        }
    };
    let pruneRooms = function () {
        var i, j, ref, results;
        results = [];
        for (i = j = ref = rooms.length - 1; ref <= 0 ? j <= 0 : j >= 0; i = ref <= 0 ? ++j : --j) {
            if ((rooms[i] != null) && !((rooms[i].top != null) || (rooms[i].bottom != null))) {
                results.push(rooms.splice(i, 1));
            } else {
                results.push(void 0);
            }
        }
        return results;
    };
    app.set('views', __dirname + '/views');
    app.engine('eco', function (filePath, options, callback) {
        fs.readFile(filePath, 'utf8', (err, body) => {
            if (err) {
                console.log('err fetcing view', err);
            }
            var bodyLayout = eco.render(body, options);
            fs.readFile(__dirname + '/views/layout.eco', 'utf8', function (err, layout) {
                if (err) {
                    console.log('err fetching layout.eco');
                }
                var opts = Object.assign(options, {
                    body: bodyLayout,
                    config: config
                });
                return callback(null, eco.render(layout, opts));
            });
        });
    });
    app.set('view engine', 'eco');
    app.set('view options', {
        layout: 'layout'
    });
    app.use(bodyParser());
    app.use(methodOverride());
    app.use(cookieParser());
    // app.use(app.router);
    app.use(express.static(__dirname + '/public'));
    app.get('/', function (request, response) {
        var token;
        if ((request.query != null) && (request.query['join-token'] != null)) {
            token = request.query['join-token'];
            response.redirect('http://' + config.publicHost + '/' + token, 303);
            return;
        }
        return response.render('home', {
            'config': config,
            'home': true
        });
    });
    app.get('/status', function (request, response) {
        var j, len, payload, room;
        pruneRooms();
        payload = {};
        payload.userCount = 0;
        payload.activeRooms = rooms.length;
        for (j = 0, len = rooms.length; j < len; j++) {
            room = rooms[j];
            payload.userCount += (room.top != null) + (room.bottom != null);
        }
        response.contentType('application/json');
        response.write(JSON.stringify(payload));
        return response.end();
    });
    app.get('/:token', function (request, response) {
        var droom, otherUserJoined, publicLink, token;
        token = request.params.token;
        droom = getRoom(token);
        if (droom == null) {
            rooms.push(new Room);
        }
        otherUserJoined = (droom != null) && ((droom.top != null) || (droom.bottom != null));
        publicLink = 'http://' + config.publicHost + '/' + token;
        return response.render('room', {
            'otherUserJoined': otherUserJoined,
            room: token,
            'config': config,
            'publicLink': publicLink
        });
    });
    let start = function (err, data) {
        if (err != null) {
            console.log('Error reading config.json');
            throw err;
        }
        config = JSON.parse(data.replace('\n', ''));
        io = io(config.port + 1);
        if (config.publicHost == null) {
            config.publicHost = 'localhost';
        }
        if (config.publicPort == null) {
            config.publicPort = 80;
        }
        app.listen(config.port, config.host);
        io.sockets.on('connection', function (socket) {
            var user;
            user = new Client(socket);
            socket.on('requestJoin', function (data) {
                var room;
                if (!((data != null) && (data.token != null))) {
                    return;
                }
                room = getRoom(data.token);
                if (room == null) {
                    room = new Room(data.token);
                    rooms.push(room);
                }
                if (room.top == null) {
                    room.top = user;
                    if (room.bottom != null) {
                        return room.bottom.socket.emit('partnerJoin', '');
                    }
                } else if (room.bottom == null) {
                    room.bottom = user;
                    if (room.top != null) {
                        return room.top.socket.emit('partnerJoin', '');
                    }
                } else {
                    return socket.emit('denyJoin', data.token);
                }
            });
            socket.on('newline', function (data) {
                if (!((data != null) && (data.token != null))) {
                    return;
                }
                return roomRoute('newline', data, user);
            });
            socket.on('diff', function (data) {
                if (!((data != null) && (data.diff != null) && (data.token != null))) {
                    return;
                }
                return roomRoute('diff', data, user);
            });
            socket.on('resetBuffer', function (data) {
                if (!((data != null) && (data.currentBuffer != null) && (data.token != null))) {
                    return;
                }
                return roomRoute('resetBuffer', data, user);
            });
            return socket.on('disconnect', function () {
                var i, j, ref, room;
                for (i = j = 0, ref = rooms.length; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
                    room = rooms[i];
                    if (room == null) {
                        return;
                    }
                    if (room.top === user) {
                        if (room.bottom != null) {
                            room.bottom.socket.emit('userDisconnect', {});
                            room.top = null;
                        } else {
                            rooms.splice(i, 1);
                        }
                    } else if (room.bottom === user) {
                        if (room.top != null) {
                            room.top.socket.emit('userDisconnect', {});
                            room.bottom = null;
                        } else {
                            rooms.splice(i, 1);
                        }
                    }
                }
                return pruneRooms();
            });
        });
        return console.log('Listening on ' + config.host + ':' + config.port);
    };
    fs.readFile(__dirname + '/config.json', 'utf8', start);
})();

