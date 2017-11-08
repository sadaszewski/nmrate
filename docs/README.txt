WE start by looking at the config file: config.json


We can see the following keys:

modalities - containing the list of modalities

modality_windows - containing modality image windows (min, max)

subjects_wildcard - this points to where are subjects are stored,
if we're using different organization than a directory per subjects
it should point to a list of empty directories with the same names
as subject names.


rating_range - range of ratings (min/max inclusive)

secret - a secret value used to generate password for the users

static_path - path to static resources

mime_types - MIME types corresponding to different extensions

enable_gzip - whether to enable GZIP compression

 Now we can start the software. We need Python, PILLOW, numpy and nibabel

Once the server writes "Serving..." we can open the browser...

OK now the interesting part, to get the admin password we need to copy the secret key

go to http://www.sha1-online.com/

and write "0" followed by the secret key

then the first six characters is out admin password, e.g. a98de1