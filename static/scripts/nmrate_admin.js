$(document).ready(function() {
	
	if (Cookies.get('user_id') === undefined) {
		alert('You\'re not logged in. You will be redirected to login page now.');
		window.location = '/static/login.html';
		return;
	}
	
	var user_id = Number(Cookies.get('user_id'));
	if (user_id !== 0) {
		alert('Only the administrator can view this page. You will be redirected.');
		window.location = '/static/index.html';
		return;
	}
	
	var password = Cookies.get('password');
	
	function get_stats() {
		var uri = '/get_stats?user_id=' + encodeURIComponent(user_id) +
			'&password=' + encodeURIComponent(password);
		$.getJSON(uri, function(reply) {
			var table = reply['stats_table'];
			var hdr = table[0];
			var ncol = hdr.length;
			var nrow = table.length;
			var table_el = $('<table>');
			var hdr_el = $('<tr />');
			for (var i = 0; i < ncol; i++) {
				hdr_el.append($('<td />').text(hdr[i]));
			}
			table_el.append(hdr_el);
			for (var i = 1; i < nrow; i++) {
				var row_el = $('<tr />');
				for (var k = 0; k < ncol; k++) {
					row_el.append($('<td />').text(table[i][k]));
				}
				table_el.append(row_el);
			}
			$('#stats_table').append(table_el);
		}).fail(function() {
			alert('Failed to get stats.');
		});
	}
	
	function set_callbacks() {
		$('#show_passwd_btn').click(function() {
			var target_user_id = $('#target_user_id').val();
			var uri = '/show_password?user_id=' + encodeURIComponent(user_id) +
				'&password=' + encodeURIComponent(password) +
				'&target_user_id=' + encodeURIComponent(target_user_id);
			$.getJSON(uri, function(reply) {
				$('#target_password').val(reply['target_password']);
			}).fail(function() {
				alert('Failed to get password for user: ' + target_user_id);
			});
		});
	}
	
	get_stats();
	set_callbacks();
});
