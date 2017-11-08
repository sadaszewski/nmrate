#
# Copyright (C) Stanislaw Adaszewski, 2017
# http://adared.ch
#

from argparse import ArgumentParser
from http.server import HTTPServer, \
	BaseHTTPRequestHandler
from socketserver import TCPServer, \
	ThreadingMixIn
from urllib.parse import urlparse, parse_qs
import re
import json
import glob
import os
import nibabel.nifti1 as nii
import numpy as np
from functools import lru_cache
from PIL import Image
import sqlite3
from threading import RLock
import hashlib
from collections import defaultdict
	
		
class MyHandler(BaseHTTPRequestHandler):
	def __init__(self, req, cli_addr, srv):
		super(MyHandler, self).__init__(req, cli_addr, srv)
		# funcType = type(self.wfile.__class__.write)
		# self.wfile.write = funcType(write_with_cnt, self.wfile, self.wfile.__class__)
		
	def do_GET(self):
		for (rx, fn) in MyHandler.url_map:
			if rx.match(self.path):
				try:
					fn(self, MyHandler.config)
				except Exception as e:
					self.wfile.write(b'HTTP/1.1 500 Exception occured\n\n')
					self.wfile.write(('Exception occured: %s' % str(e)).encode('utf-8'))
				return
		self.wfile.write(b'HTTP/1.1 404 Not Found\n\nNot Found')
		
MyHandler.url_map = []
MyHandler.mime_types = defaultdict(lambda: 'application/octet-stream')

class MyServer(TCPServer):
	def __init__(self, addr):
		super(MyServer, self).__init__(addr, MyHandler)
		
		
def handle_url(url):
	def inner(fn):
		MyHandler.url_map.append((re.compile(url), fn))
		return fn
	return inner
	
	
@lru_cache(maxsize=128)
def load_vol(fname):
	return nii.load(fname)
	
	
@handle_url("/subjects_list")
def subject_list(req, config):
	req.wfile.write(b'HTTP/1.1 200 OK\n')
	req.wfile.write(b'Content-Type: text/json\n\n')
	subjs = glob.glob(config['subjects_wildcard'])
	subjs = list(map(lambda a: os.path.split(a)[-1], subjs))
	content = json.dumps(subjs)
	req.wfile.write(content.encode('utf-8'))
	
	
@handle_url("/modalities")
def modalities(req, config):
	req.wfile.write(b'HTTP/1.1 200 OK\n')
	req.wfile.write(b'Content-Type: text/json\n\n')
	req.wfile.write(json.dumps(config['modalities']).encode('utf-8'))
	
	
@handle_url("/modality_windows")
def modalities(req, config):
	req.wfile.write(b'HTTP/1.1 200 OK\n')
	req.wfile.write(b'Content-Type: text/json\n\n')
	req.wfile.write(json.dumps(config['modality_windows']).encode('utf-8'))
	
	
@handle_url("/volume_info")
def volume_info(req, config):
	req.wfile.write(b'HTTP/1.1 200 OK\n')
	req.wfile.write(b'Content-Type: text/json\n\n')
	qs = parse_qs(urlparse(req.path).query)
	subj = qs['subject'][0]
	mod = qs['modality'][0]
	fname = config['modality_paths'][mod].format(subject=subj, modality=mod)
	print('subj:', subj, 'mod:', mod, 'fname:', fname)
	vol = load_vol(fname)
	# print('vol:', vol)
	content = json.dumps({
		'shape': vol.shape,
		'affine': np.ravel(vol.affine).tolist()
		# 'dtype': vol.dataobj.dtype.name,
		# 'slope': vol.dataobj.slope,
		# 'inter': vol.dataobj.inter
	})
	req.wfile.write(content.encode('utf-8'))
	
	
def slice_common(sel_fn):
	def inner(req, config):
		qs = parse_qs(urlparse(req.path).query)
		subj = qs['subject'][0]
		mod = qs['modality'][0]
		fname = config['modality_paths'][mod].format(subject=subj, modality=mod)
		vol = load_vol(fname)
		content = sel_fn(qs, vol).tostring()
		req.wfile.write(b'HTTP/1.1 200 OK\n')
		req.wfile.write(b'Content-Type: application/octet-stream\n')
		req.wfile.write(('Content-Length: %d\n\n' % len(content)).encode('utf-8'))
		req.wfile.write(content)
	return inner
	
	
def slice_common_png(sel_fn):
	def inner(req, config):
		qs = parse_qs(urlparse(req.path).query)
		subj = qs['subject'][0]
		mod = qs['modality'][0]
		fname = config['modality_paths'][mod].format(subject=subj, modality=mod)
		vol = load_vol(fname)
		slice = sel_fn(qs, vol).T
		# print('slice:', slice)
		scaled = (slice - np.min(slice)) * 255 / (np.max(slice) - np.min(slice))
		req.wfile.write(b'HTTP/1.1 200 OK\n')
		req.wfile.write(b'Content-Type: image/png\n\n')
		Image.fromarray(scaled.astype(np.uint8)).save(req.wfile, 'PNG')
	return inner
	

@handle_url("/xy_slice")
@slice_common
def xy_slice(qs, vol):
	z = int(qs['z'][0])
	return vol.dataobj[:, :, z]
	
	
@handle_url("/xz_slice")
@slice_common
def xz_slice(qs, vol):
	y = int(qs['y'][0])
	slice = np.squeeze(vol.dataobj[:, y, :])
	slice = slice[:, ::-1]
	return slice

	
@handle_url("/yz_slice")
@slice_common
def yz_slice(qs, vol):
	x = int(qs['x'][0])
	slice = np.squeeze(vol.dataobj[x, :, :])
	slice = slice[:, ::-1]
	return slice
	
	
@handle_url("/subject_rate")
def subject_rate(req, config):
	qs = parse_qs(urlparse(req.path).query)
	subj = qs['subject'][0]
	user_id = int(qs['user_id'][0])
	rating = int(qs['rating'][0])
	password = qs['password'][0]
	if not verify_password(user_id, password, config):
		raise ValueError('Invalid password')
	if rating < config['rating_range'][0] or \
		rating > config['rating_range'][1]:
		raise ValueError('Rating out of range')
	with MyHandler.db_lock:
		MyHandler.db.execute('INSERT OR REPLACE INTO ratings(user_id, subject, rating)'
			' VALUES(?, ?, ?)', (user_id, subj, rating))
		MyHandler.db.commit()
	req.wfile.write(b'HTTP/1.1 200 OK\n\nOK')
	
	
@handle_url("/get_rating")
def get_rating(req, config):
	qs = parse_qs(urlparse(req.path).query)
	subj = qs['subject'][0]
	user_id = int(qs['user_id'][0])
	with MyHandler.db_lock:
		c = MyHandler.db.execute('SELECT rating FROM ratings WHERE user_id=? AND subject=?', (user_id, subj))
		rating = c.fetchall()[0][0]
	req.wfile.write(b'HTTP/1.1 200 OK\n')
	req.wfile.write(b'Content-Type: text/json\n\n')
	req.wfile.write(json.dumps({'rating': rating}).encode('utf-8'))
	

@handle_url("/login")
def handle_login(req, config):
	qs = parse_qs(urlparse(req.path).query)
	user_id = int(qs['user_id'][0])
	password = qs['password'][0]
	if verify_password(user_id, password, config):
		req.wfile.write(b'HTTP/1.1 200 OK\n')
		req.wfile.write(b'Content-Type: text/json\n\n')
		req.wfile.write(json.dumps({'success': True}).encode('utf-8'))
	else:
		req.wfile.write(b'HTTP/1.1 403 Forbidden\n\nWrong credentials')
	
	
@handle_url("/static")
def handle_static(req, config):
	path = urlparse(req.path).path[len("/static")+1:]
	# print('static_path:', config['static_path'], 'path:', path)
	full_path = os.path.join(config['static_path'], path)
	# print('full_path:', full_path)
	if not os.path.exists(full_path):
		req.wfile.write(b'HTTP/1.1 404 Not Found\n\nNot Found')
		return
	[path, name] = os.path.split(path)
	[name, ext] = os.path.splitext(name)
	with open(full_path, "rb") as f:
		content = f.read()
	mime_type = MyHandler.mime_types[ext[1:]]
	req.wfile.write(b'HTTP/1.1 200 OK\n')
	req.wfile.write(('Content-Type: %s\n' % mime_type).encode('utf-8'))
	req.wfile.write(('Content-Length: %d\n\n' % len(content)).encode('utf-8'))
	req.wfile.write(content)
	

def bootstrap_db(db):
	db.execute('CREATE TABLE IF NOT EXISTS ratings(user_id INT, subject TEXT, rating INT)')
	db.execute('CREATE UNIQUE INDEX IF NOT EXISTS u_s ON ratings(user_id, subject)')

	
def verify_password(user_id, passwd, config):
	correct = hashlib.sha1(('%d%s' % (user_id, config['secret'])).encode('utf-8')).hexdigest()[:6]
	return (passwd == correct)
	

def main():
	db = sqlite3.connect('nmrate.db', check_same_thread=False)
	bootstrap_db(db)
	MyHandler.db = db
	MyHandler.db_lock = RLock()
	with open('config.json', 'r') as f:
		MyHandler.config = json.loads(f.read())
	MyHandler.mime_types.update(MyHandler.config['mime_types'])
	srv = MyServer(('', 8080))
	print('Serving...')
	print(MyHandler.url_map)
	srv.serve_forever()
	


if __name__ == '__main__':
	main()