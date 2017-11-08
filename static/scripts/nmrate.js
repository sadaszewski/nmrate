//
// Copyright (C) Stanislaw Adaszewski, 2017
// http://adared.ch
//

$(document).ready(function() {
	if (Cookies.get('user_id') === undefined) {
		alert('You\'re not logged in. You will be redirected to login page now.');
		window.location = '/static/login.html';
		return;
	}
	
	var ori = ['xy', 'xz', 'yz'];
	var ax_name = ['z', 'y', 'x'];
	var ax_idx = [2, 1, 0];
	var horz_ax = [0, 0, 1];
	var vert_ax = [1, 2, 2];
	var ax_flip = [false, false, true];
	var colormap = nmrate.colormap.grayscale;
	
	var password = Cookies.get('password');
	var user_id = Cookies.get('user_id');
	var subject = Cookies.get('subject');
	
	var modalities;
	var modality_windows;
	var vol_info;
	var xyz;
	var slice_cache = new LRUMap(128);
	var xhairs = true;
	
	$('#user_name').text('User ' + user_id);
	
	function get_subjects() {
		$.getJSON('/subjects_list', function(reply) {
			$('#subjects_dropdown option').remove();
			for (var i = 0; i < reply.length; i++) {
				console.log(i);
				var entry = $('<option />').val(reply[i]).text(reply[i]);
				if (i == 0 && subject === undefined) {
					subject = reply[i];
				}
				if (subject === reply[i]) {
					entry.attr('selected', 'selected');
				}
				$('#subjects_dropdown').append(entry);
			}
			
			get_rating_range();
		});
	}
	
	function get_rating_range() {
		$.getJSON('/rating_range', function(reply) {
			$('#rating_dropdown option').remove();
			$('#rating_dropdown').append($('<option />').text('Unrated'));
			for (var i = reply[0]; i <= reply[1]; i++) {
				var entry = $('<option />').val(i).text(i);
				$('#rating_dropdown').append(entry);
			}
			
			get_rating();
		});
	}
	
	function get_rating() {
		var uri = '/get_rating?subject=' + encodeURIComponent(subject) +
			'&user_id=' + encodeURIComponent(user_id) +
			'&password=' + encodeURIComponent(password);
		$.getJSON(uri, function(reply) {
			$('#rating_dropdown option[value=' + reply['rating'] + ']')
				.attr('selected', 'selected');
			get_modalities();
		}).fail(get_modalities);
	}
	
	function get_modalities() {
		$.getJSON('/modalities', function(reply) {
			modalities = reply;
			
			get_modality_windows();
		});
	}
	
	function get_modality_windows() {
		$.getJSON('/modality_windows', function(reply) {
			modality_windows = reply;
			// alert('modality_windows:' + modality_windows);
			get_volume_info();
		});
	}
	
	function get_volume_info() {
		var uri = '/volume_info?subject=' + encodeURIComponent(subject) +
			'&modality=' + encodeURIComponent(modalities[0]);
		// alert(uri);
		$.getJSON(uri, function(reply) {
			
			vol_info = reply;
			// alert(vol_info['shape']);
			var shape = vol_info['shape'];
			xyz = [Math.floor(shape[0]/2),
				Math.floor(shape[1]/2),
				Math.floor(shape[2]/2)];
				
			make_display_grid();
		});
	}
	
	function make_display_grid() {
		var shape = vol_info['shape'];
		
		var table = $('<table />');
		
		var header = $('<tr />');
		for (var i = 0; i < modalities.length; i++) {
			var cell = $('<td></td>');
			cell.append(modalities[i]);
			cell.append(' <i class="fa fa-adjust"></i>');
			var wnd_min = $('<input type="text" class="imag_wnd" />')
				.attr('id', 'wnd_min_' + i)
				.val(modality_windows[modalities[i]][0])
				.change(refresh_all);
			var wnd_max = $('<input type="text" class="imag_wnd" />')
				.attr('id', 'wnd_max_' + i)
				.val(modality_windows[modalities[i]][1])
				.change(refresh_all);
			cell.append(wnd_min);
			cell.append(wnd_max);
			header.append(cell);
		}
		table.append(header);
		
		for (var k = 0; k < ori.length; k++) {
			var row = $('<tr />');
			for (var i = 0; i < modalities.length; i++) {
				var cell = $('<td />');
				
				var w = shape[horz_ax[k]];
				var h = shape[vert_ax[k]];
				
				var canvas = $('<canvas />')
					.attr('width', w)
					.attr('height', h)
					.attr('id', 'cell_' + i + '_' + k);
				canvas.click(function(i, k) {
					return function(e) {
						on_canvas_click(i, k, e);
					}
				}(i, k));
				cell.append(canvas);
				
				row.append(cell);
			}
			table.append(row);
		}
		// $('#display_grid').remove('table');
		$('#display_grid').append(table);
		
		fetch_all_slices();
	}
	
	function fetch_slice(i, k) {
		var uri = '/' + ori[k] + '_slice?subject=' + encodeURIComponent(subject) +
			'&modality=' + encodeURIComponent(modalities[i]) +
			'&' + ax_name[k] + '=' + encodeURIComponent(xyz[ax_idx[k]]);
			
		if (slice_cache.has(uri)) {
			update_canvas(i, k, slice_cache.get(uri));
			return;
		}
		
		console.log('Loading ' + uri + ' ...');
		var xhr = new XMLHttpRequest();
		xhr.responseType = 'arraybuffer';
		xhr.open('GET', uri, true);
		xhr.onload = function(i, k, xhr) { return function(ev) {
			if (xhr.readyState != 4) return;
			var buffer = xhr.response;
			console.log('Retrieved i:' + i + ' k:' + k);
			// slice_cache[i * ori.length + k] = buffer;
			slice_cache.set(uri, buffer);
			update_canvas(i, k, buffer);
		} } (i, k, xhr);
		xhr.onerror = function(uri) { return function(ev) {
			alert('Error retrieving ' + uri);
		} } (uri);
		xhr.send(null);
	}
	
	function update_canvas(i, k, buffer) {
		// var buffer = slice_cache.get[i * ori.length + k];
		var ary = new Float64Array(buffer);
		var canvas = $('#cell_' + i + '_' + k).get(0);
		var ctx = canvas.getContext('2d');
		
		var wnd_min = Number($('#wnd_min_' + i).val());
		var wnd_max = Number($('#wnd_max_' + i).val());
		var shape = vol_info['shape'];
		var w = shape[horz_ax[k]];
		var h = shape[vert_ax[k]];
		
		var imgData = ctx.getImageData(0, 0, w, h);
		for (var y = 0; y < h; y++) {
			var y_1 = y;
			if (ax_flip[vert_ax[k]]) {
				y_1 = h - y_1 - 1;
			}
			
			for (var x = 0; x < w; x++) {
				
				var value = ary[x * h + y];
				if (value > wnd_max) value = wnd_max;
				else if (value < wnd_min) value = wnd_min;
				value = Math.round((value - wnd_min) * 255 / (wnd_max - wnd_min));
				value = colormap[value];
				
				if (value === undefined) continue; // value = wnd_min;
				
				var x_1 = x;
				if (ax_flip[horz_ax[k]]) {
					x_1 = w - x_1 - 1;
				}
				
				var ofs = (y_1 * w + x_1) * 4;
				imgData.data[ofs + 0] = value[0];
				imgData.data[ofs + 1] = value[1];
				imgData.data[ofs + 2] = value[2];
				imgData.data[ofs + 3] = 255;
			}
		}
		
		if (xhairs) {
			var xhair_x = xyz[horz_ax[k]];
			if (ax_flip[horz_ax[k]]) xhair_x =
				vol_info['shape'][horz_ax[k]] - xhair_x - 1;
			
			for (var y = 0; y < h; y++) {
				var ofs = (y * w + xhair_x) * 4;
				imgData.data[ofs + 0] = 255;
				imgData.data[ofs + 1] = 255;
				imgData.data[ofs + 2] = 255;
				imgData.data[ofs + 3] = 255;
			}
			
			var xhair_y = xyz[vert_ax[k]];
			if (ax_flip[vert_ax[k]]) xhair_y =
				vol_info['shape'][vert_ax[k]] - xhair_y - 1;
			
			for (var x = 0; x < w; x++) {
				var ofs = (xhair_y * w + x) * 4;
				imgData.data[ofs + 0] = 255;
				imgData.data[ofs + 1] = 255;
				imgData.data[ofs + 2] = 255;
				imgData.data[ofs + 3] = 255;
			}
		}
		
		ctx.putImageData(imgData, 0, 0);
		
	}
	
	function fetch_all_slices() {
		for (var i = 0; i < modalities.length; i++) {
			for (var k = 0; k < ori.length; k++) {
				fetch_slice(i, k);
			}
		}
	}
	
	function refresh_all() {
		fetch_all_slices();
		/* for (var i = 0; i < modalities.length; i++) {
			for (var k = 0; k < ori.length; k++) {
				update_canvas(i, k);
			}
		} */
	}
	
	function set_callbacks() {
		$('#user_btn').click(function() {
			if (confirm('You\'re logged in as User ' + user_id + '. Do you want to log out?')) {
				Cookies.remove('user_id');
				Cookies.remove('password');
				window.location = '/static/login.html';
			}
		});
		$('#colormap_dropdown').change(function() {
			colormap = nmrate.colormap[$('#colormap_dropdown').val()];
			refresh_all();
		});
		$('#xhairs_btn').click(function() {
			xhairs = !xhairs;
			if (!xhairs) {
				$('#xhairs_btn').addClass('off');
			} else {
				$('#xhairs_btn').removeClass('off');
			}
			refresh_all();
		});
		$('#rating_dropdown').change(function() {
			var uri = '/subject_rate?subject=' + encodeURIComponent(subject) +
				'&user_id=' + encodeURIComponent(user_id) +
				'&password=' + encodeURIComponent(password) +
				'&rating=' + $(this).val();
			$.getJSON(uri, function(reply) {
				alert('Rating submitted successfully');
			});
		});
	}
	
	function on_canvas_click(i, k, e) {
		var canvas = $('#cell_' + i + '_' + k);
		var x = e.pageX - canvas.offset().left;
		var y = e.pageY - canvas.offset().top;
		console.log('x: ' + x + ' y:' + y);
		
		var w = vol_info['shape'][horz_ax[k]];
		var h = vol_info['shape'][vert_ax[k]];
		if (x < 0) x = 0; else if (x >= w) x = w;
		if (y < 0) y = 0; else if (y >= h) y = h;
		if (ax_flip[horz_ax[k]]) x = w - x;
		if (ax_flip[vert_ax[k]]) y = h - y;
		xyz[horz_ax[k]] = x;
		xyz[vert_ax[k]] = y;
		fetch_all_slices();
		
		e.preventDefault();
		e.stopPropagation();
		return false;
	}
	
	get_subjects();
	set_callbacks();
});
