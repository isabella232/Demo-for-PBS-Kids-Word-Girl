/*global define $ requestAnimationFrame*/

define(function (require) {
	
	var Backbone = require('backbone'),
        Vars = require('app/models/vars'),
        Anim = require('app/utils/anim/anim'),
        CellCollection = require('app/collections/cells'),
        CameraPath = require('app/utils/camera-path'),
        CanvasView = require('app/views/canvas-view'),
        DomView = require('app/views/dom-view'),
        UserEvent = require('app/events/user-event'),
        AppEvent = require('app/events/app-event'),
        ComicView;

    ComicView = Backbone.View.extend({

        initialize: function () {
            this.position = {x: 0, y: 0};
            this.positionDelta = {x: 0, y: 0}; //delta for tracking
            this.touchDelta = {x: 0, y: 0}; //delta for tracking
            this.scale = 1;
            
            this.animating = true;

			this.cells = new CellCollection();
            this.cells.fetch({success: this.handle_CELLS_READY.bind(this)});
        },

        render: function () {
            var i,
                cell,
                distance,
                alpha,
                divisor = 1000;

            Vars.set('x', this.position.x);
            Vars.set('y', this.position.y);
            Vars.set('scale', this.scale);

            /*
            //go through cells and update alpha based on position
            for (i = 0; i < this.cells.length; i += 1) {
                cell = this.cells.at(i);
                distance = Math.abs(cell.center().x - this.position.x);
                alpha = 1 - (distance / divisor);
                alpha = alpha > 0 ? alpha : 0;
                cell.set('alpha', alpha);

                if (i == 1) {
                    $('#debugger').html(cell.center().x + ' __ ' + this.position.x + ' ' + alpha);
                }
            }
            */

            if (this.animating !== false) {
                AppEvent.trigger('animate');
            }
        },

        handle_CELLS_READY: function () {

            this.cameraPath = new CameraPath(this.cells);

		    this.canvasView = new CanvasView({cells: this.cells, path: this.cameraPath});
            this.domView = new DomView({cells: this.cells});

            var cell = this.cells.at(Vars.get('currentFrame'));
            this.scale = this.checkScale();
            this.position.x = -(cell.get('x') + (cell.get('w') / 2) * this.scale) + (window.innerWidth / 2);
            this.position.y = -(cell.get('y') + (cell.get('h') / 2) * this.scale) + (window.innerHeight / 2);

            UserEvent.on('mousewheel', this.handle_MOUSEWHEEL.bind(this));
            UserEvent.on('touchstart', this.handle_TOUCHSTART.bind(this));
            UserEvent.on('touchmove', this.handle_TOUCHMOVE.bind(this));
            UserEvent.on('touchend', this.handle_TOUCHEND.bind(this));
            UserEvent.on('resize', this.resize.bind(this));
            UserEvent.on('orientationchange', this.orientationchange.bind(this));
            AppEvent.on('render', this.render.bind(this));
        },

        handle_TOUCHSTART: function (e) {
			
            var touch = e.touches[0];
            
            if (touch.pageX > window.innerWidth / 2) {
                this.next();
            } else {
                this.previous();
            }
        },

        handle_TOUCHMOVE: function (e) {
            
        },

        handle_TOUCHEND: function (e) {
            
        },

        /**
         * navigate along camera path with mousewheel
         */
        handle_MOUSEWHEEL: function (e) {

            var camera = this.cameraPath,
                pos = camera.currentPosition,
                path = camera.path;

            //mousewheel
            //if (e.wheelDeltaY % 120 === 0) {
            //    return;
            //}

            this.animating = false;

            e.preventDefault();
            
            Anim.kill();
            clearTimeout(this.MOUSEWHEEL_TIMEOUT);

            //track pad
            if (pos - e.wheelDeltaY > 0 && pos - e.wheelDeltaY < path.length - 1) {
                pos -= e.wheelDeltaY;
            } else if (pos - e.wheelDeltaY < 0) {
                pos = 0;
            } else if (pos - e.wheelDeltaY > path.length - 1) {
                pos = path.length - 1;
            }
            
            camera.currentPosition = pos;
            this.position.x = -(path[pos].x * this.scale) + (window.innerWidth / 2);
            this.position.y = -(path[pos].y * this.scale) + (window.innerHeight / 2);

            this.MOUSEWHEEL_TIMEOUT = setTimeout(this.cameraToClosestFrame.bind(this), 300);
        },

        next: function () {
            var key,
                keys = this.cameraPath.keys;

            this.cameraPath.currentKey = this.cameraPath.currentKey < keys.length - 1 ? this.cameraPath.currentKey + 1 : keys.length - 1;
            key = keys[this.cameraPath.currentKey];
            Vars.set('currentFrame', this.cameraPath.currentKey);
            this.tweento(key);
        },

        previous: function () {
            var key,
                keys = this.cameraPath.keys;

            this.cameraPath.currentKey = this.cameraPath.currentKey > 0 ? this.cameraPath.currentKey - 1 : 0;
            key = keys[this.cameraPath.currentKey];
            Vars.set('currentFrame', this.cameraPath.currentKey);
            this.tweento(key);
        },

        /**
         * tween to frame
         */
        tweento: function (point) {
            
            var scale = this.checkScale();
            Anim.to(this, 0.5, {scale: scale}, {});

            Anim.to(this.position, 0.5, {
                x: -point.x * scale + (window.innerWidth / 2), 
                y: -point.y * scale + (window.innerHeight / 2)
            }, {
                onComplete: function () {
                    this.animating = true;
                }.bind(this)
            });
        },

        /**
         * animate to the nearest keyframe
         */
        cameraToClosestFrame: function () {
            
            var closestKey,
                i,
                diff,
                pos = this.cameraPath.currentPosition,
                keys = this.cameraPath.keys,
                keyId,
                scale;
                
            for (i = 0; i < keys.length; i += 1) {
                diff = Math.abs(keys[i].pointId - pos);
                    
                if (i === 0) {
                    closestKey = keys[i];
                    keyId = i;
                } else if (diff < Math.abs(closestKey.pointId - pos)) {
                    closestKey = keys[i];
                    keyId = i;
                }
            }	
            
            this.cameraPath.currentKey = keyId;
            this.cameraPath.currentPosition = closestKey.pointId;
            Vars.set('currentFrame', keyId);

            this.tweento(closestKey);
        },

        /**
         * set scale based on w/h ratio
         */
        checkScale: function () {
            var cell = this.cells.at(Vars.get('currentFrame')),
                _winHeight = window.innerHeight,
                _winWidth = window.innerWidth,
                widthDiff = 0,
                heightDiff = 0,
                scale = 1;

            if (cell.get('w') > _winWidth) {
                widthDiff = cell.get('w') - _winWidth;
            }

            if (cell.get('h') > _winHeight) {
                heightDiff = cell.get('h') - _winHeight;
            }

            if (widthDiff > heightDiff) {
                scale = _winWidth / cell.get('w');
            } else if (heightDiff > widthDiff) {
                scale = _winHeight / cell.get('h');
            } else {
                scale = 1;
            }

            scale = Math.round(scale * 100) / 100;

            return scale;
        },

        orientationchange: function () {
            this.resize();
        },

        resize: function () {
            var key,
                keys = this.cameraPath.keys;

            this.cameraPath.currentKey = Vars.get('currentFrame');
            key = keys[this.cameraPath.currentKey];
            this.tweento(key);
        }

    });

	return ComicView;
});