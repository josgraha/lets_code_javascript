// Copyright (c) 2015-2016 Titanium I.T. LLC. All rights reserved. For license, see "README" or "LICENSE" file.
/* global io:false, $:false */
(function() {
	"use strict";

	var shared = require("./__test_harness_shared.js");
	var http = require("http");
	var socketIo = require("socket.io");
	var url = require("url");
	var querystring = require("querystring");
	var NetworkPointerEvent = require("../../shared/network_pointer_event.js");

	var endpoints = shared.endpoints;

	// The network test harness is started inside of the build script before the network tests are run
	exports.start = function() {
		var httpServer = http.createServer();
		httpServer.on("request", handleResponse);
		var io = socketIo(httpServer);
		httpServer.listen(shared.PORT);

		var endpointMap = {};
		endpointMap[endpoints.WAIT_FOR_POINTER_LOCATION] = setupWaitForPointerLocation(io);
		endpointMap[endpoints.IS_CONNECTED] = setupIsConnected(io);
		endpointMap[endpoints.WAIT_FOR_SERVER_DISCONNECT] = setupWaitForServerDisconnect();
		endpointMap[endpoints.SEND_POINTER_LOCATION] = setupSendPointerLocation();

		return stopFn(httpServer, io);

		function handleResponse(request, response) {
			response.setHeader("Access-Control-Allow-Origin", "*");

			var parsedUrl = url.parse(request.url);
			var path = parsedUrl.pathname;

			var endpoint = endpointMap[path];
			if (endpoint !== undefined) {
				var parsedQuery = querystring.parse(parsedUrl.query);
				var parsedData = parsedQuery.data !== undefined ? JSON.parse(parsedQuery.data) : undefined;
				endpoint(getSocket(io, parsedQuery.socketId), parsedData, request, response);
			}
			else {
				response.statusCode = 404;
				response.end("Not Found");
			}
		}
	};

	function getSocket(io, clientSocketId) {
		var socketId = "/#" + clientSocketId;
		return io.sockets.sockets[socketId];
	}

	function stopFn(httpServer, io) {
		// Socket.IO doesn't exit cleanly, so we have to manually collect the connections
		// and unref() them so the server process will exit.
		// See bug #1602: https://github.com/socketio/socket.io/issues/1602
		var connections = [];
		httpServer.on("connection", function(socket) {
			connections.push(socket);
		});

		return function(callback) {
			return function() {
				io.close();
				connections.forEach(function(socket) {
					socket.unref();
				});
				callback();
			};
		};
	}

	function setupWaitForPointerLocation(io) {
		var lastPointerLocation = {};

		io.on("connection", function(socket) {
			socket.on("mouse", function(data) {
				lastPointerLocation[socket.id] = data;
			});
		});

		return function waitForPointerLocationEndpoint(socket, data, request, response) {
			var socketId = socket.id;

			var result = lastPointerLocation[socketId];

			if (result === undefined) {
				socket.on("mouse", sendResponse);
			}
			else {
				sendResponse(result);
			}

			function sendResponse(data) {
				response.end(JSON.stringify(data));
				delete lastPointerLocation[socketId];
			}
		};
	}

	function setupIsConnected(io) {
		return function isConnectedEndpoint(socket, data, request, response) {
			var socketIds = Object.keys(io.sockets.connected).map(function(id) {
				return id.substring(2);
			});
			response.end(JSON.stringify(socketIds));
		};
	}

	function setupWaitForServerDisconnect() {
		return function waitForServerDisconnectEndpoint(socket, data, request, response) {
			if (socket === undefined || socket.disconnected) return response.end("disconnected");
			socket.on("disconnect", function() {
				return response.end("disconnected");
			});
		};
	}

	function setupSendPointerLocation() {
		return function sendPointerLocationEndpoint(socket, data, request, response) {
			socket.emit(NetworkPointerEvent.EVENT_NAME, data);

			return response.end("ok");
		};
	}

}());