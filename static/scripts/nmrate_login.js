$(document).ready(function() {
	$('#ok_button').click(function() {
		var user_id = $('#user_id').val();
		var password = $('#password').val();
		//alert('user_id: ' + user_id + ' password: ' + password);
		var uri = '/login?user_id=' + encodeURIComponent(user_id) +
			'&password=' + encodeURIComponent(password);
		$.get(uri, function() {
			// alert('Login ');
			Cookies.set('user_id', user_id);
			Cookies.set('password', password);
			window.location = '/static/index.html';
		}).fail(function() {
			alert('Login failed. Please try again or contact the Administrator.');
		});
	});
});