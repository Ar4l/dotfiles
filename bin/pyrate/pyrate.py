#!/usr/bin/env python3
import os, logging, pickle, fire, subprocess, requests, tabulate, dataclasses as dc

@dc.dataclass
class Data:
    library_path: str | None = None    # path to music library
    playlists: dict | None = None      # { name: url }

logging.basicConfig(level=logging.ERROR)

class Pyrate(object):
    '''
    Download Spotify playlists, Youtube and Soundcloud songs.
    '''
    METADATA_FILE = 'pyrate-data'
    SCRIPT_PATH = os.path.dirname(os.path.realpath(__file__))
    PLAYLISTS_FOLDER = 'playlists'
    YOUTUBE_FOLDER = 'youtube'
    SOUNDCLOUD_FOLDER = 'soundcloud'

    def __init__(self):
        ''' load and validate metadata: Data '''
        self._metadata : Data = self._load_metadata(os.path.join(self.SCRIPT_PATH, self.METADATA_FILE))

        if not os.path.exists(self._metadata.library_path):
            print(f'library path is invalid!')
            self.reset()

        print(f'{self._metadata.library_path} contains {len(self._metadata.playlists)} playlists\n')

    def list(self):
        '''
        list all playlists
        '''
        def get_info(pl: str, url: str) -> list:
            ''' get playlist info for tabulation '''

            m3u_file = os.path.join(
                    self._metadata.library_path, self.PLAYLISTS_FOLDER,
                    pl, f'{pl.strip()}.m3u'
                )
            track_count = len(open(m3u_file, 'r').readlines()) \
                if os.path.isfile(m3u_file) \
                else '\033[1;31mmissing\033[0m'
            hyperlinked_name = f'\x1b]8;;{url}\x1b\\\033[1m{pl:.35}\033[0m\x1b]8;;\x1b\\'

            return [track_count, hyperlinked_name]

        print(tabulate.tabulate(
            [get_info(*pl_item) for index, pl_item in enumerate(self._metadata.playlists.items())],
            headers=['tracks', 'playlist'],
            showindex=True
        ))

        print() # add a newline for cleanliness

    def get(self, url):
        '''
        provided a playlist url, get it from the appropriate source
        '''

        # first, assert that the user does not have the playlist saved already, by checking its url
        for name, playlist_url in self._metadata.playlists.items():
            if playlist_url == url:
                print(f'Playlist {name} already exists in metadata. Just sync it.')
                return

        if 'spotify' in url:
            self._get_spotify_playlist(url)
        elif 'youtube' in url:
            print('fetching from youtube')
            self._get_youtube_song(url)
        elif 'soundcloud' in url:
            print('fetching from soundcloud')
            self._get_soundcloud_song(url)

    def sync(self, playlist_input=None):
        '''
        call spotdl to sync all playlists, or provide input
        '''
        if playlist_input is None:
            playlist_input = input('Please enter the name or index of the playlist you want to sync (press enter for all): ')
            if playlist_input == 'q' or playlist_input == 'quit':
                return

        opt_all = playlist_input == ''
        opt_name = playlist_input in self._metadata.playlists
        opt_index = (type(playlist_input) == int or playlist_input.isdigit()) \
            and int(playlist_input) < len(self._metadata.playlists) \
            and int(playlist_input) >= 0

        if opt_all:
            for name, url in self._metadata.playlists.items():
                self._get_spotify_playlist(url, name, block=True)
        elif opt_name:
            self._get_spotify_playlist(self._metadata.playlists[playlist_input], playlist_input, block=True)
        elif opt_index:
            self._get_spotify_playlist(list(self._metadata.playlists.values())[int(playlist_input)], list(self._metadata.playlists.keys())[int(playlist_input)], block=True)
        else:
            print('Invalid input. Please try again.')
            return

    def remove(self, playlist_input=None):
        '''
        remove a playlist from the metadata
        '''
        if playlist_input is None:
            playlist_input = input('Please enter the name or index of the playlist you want to remove (press enter for all): ')
            if playlist_input == 'q' or playlist_input == 'quit':
                return

        opt_all = playlist_input == ''
        opt_name = playlist_input in self._metadata.playlists
        opt_index = (type(playlist_input) == int or playlist_input.isdigit()) \
            and int(playlist_input) < len(self._metadata.playlists) \
            and int(playlist_input) >= 0

        if opt_all:
            n_playlists = len(self._metadata.playlists)
            confirm = input(f'Are you sure you want to delete all {n_playlists} playlists? (y/n): ')
            if confirm != 'y':
                return
            print(f'Removing {n_playlists} playlists.')
            self.list()
            self._metadata.playlists = {}

        elif opt_name:
            url = self._metadata.playlists[playlist_input]
            hyperlinked_name = f'\x1b]8;;{url}\x1b\\\033[1m{playlist_input:.35}\033[0m\x1b]8;;\x1b\\'

            print(f'Removing \033[4m{hyperlinked_name}\033[0m')
            del self._metadata.playlists[playlist_input]

        elif opt_index:
            pl_name = list(self._metadata.playlists.keys())[int(playlist_input)]
            url = self._metadata.playlists[pl_name]
            hyperlinked_name = f'\x1b]8;;{url}\x1b\\\033[1m{pl_name:.35}\033[0m\x1b]8;;\x1b\\'

            print(f'Removing \033[4m{hyperlinked_name}\033[0m')
            del self._metadata.playlists[pl_name]

        else:
            print('Invalid input. Please try again.')
            return

        self._save_metadata()

    def reset(self):
        ''' reset the library path '''

        # get library path
        library_path = input(f'Enter new library path (leave empty for cwd)')
        if library_path.strip() == '': library_path = os.getcwd()
        print(f'Library location: {library_path}')

        # if not valid, ask user again
        if not os.path.isdir(library_path):
            print(f'Invalid path!')
            return self.reset()

        # update & save
        self._metadata.library_path = library_path
        self._save_metadata()

    def _get_spotify_playlist(self, url: str, name=None, block=False):
        '''
        get a spotify playlist
        '''
        # first we want to visit the url and get the playlist name
        # then we want to create a folder with that name in the playlists folder
        # then, call spotdl to download the playlist to that folder
        # then, add the playlist to the metadata, and save it
        if '?' in url:
            url = url.split('?')[0]

        if name is None:
            # get playlist name by curl and parsing the name
            try:
                response = requests.get(url).content[:300]
                # get what's between <title> and </title>
                page_title = response.split(b'<title>')[1].split(b'</title>')[0].split(b',')[0].decode('utf-8')
                name = page_title.split(' - ')[0]
            except:
                name = input('Could not get playlist name. Please enter it manually: ')
        name = name.strip()

        # add playlist to metadata
        self._metadata.playlists[name] = url
        self._save_metadata()

        print(f'Syncing from Spotify: {name}')

        # create folder for playlist
        playlist_path = os.path.join(self._metadata.library_path, self.PLAYLISTS_FOLDER, name)
        if not os.path.exists(playlist_path):
            os.makedirs(playlist_path)
        os.chdir(playlist_path)

        # call spotdl to download the playlist
        #    sync <url> --format m4a --save-file <pl_name>.spotdl --m3u <pl_name>.m3u
        p = subprocess.Popen(f'''
            spotdl sync {url} --format m4a --save-file '{name}.spotdl' --m3u '{name}.m3u' --threads 16
            '''.strip(),
            shell=True,
        )
        if block: p.wait()

    def _get_youtube_song(self, url):
        '''
        get a youtube song and add to 'youtube' playlist
        '''
        print('TODO')
        pass

    def _get_soundcloud_song(self, url):
        '''
        get a soundcloud song and add to 'soundcloud' playlist
        '''
        print('TODO')
        pass

    def _load_metadata(self, metadata_path):

        if os.path.exists(metadata_path):
            data : Data = pickle.load(open(metadata_path, 'rb'))

        else:
            data = Data()

            # need to prompt user to provide library path, press enter to use cwd
            data.library_path = input('Please enter the path to your music library (press enter for cwd): ')
            if data.library_path == '':
                data.library_path = os.getcwd()

            data.playlists = {}
            # save data
            pickle.dump(data, open(metadata_path, 'wb'))

        return data

    def _save_metadata(self):
        ''' save metadata, with playlists sorted on name. '''

        # sort the playlists by name
        self._metadata.playlists = dict(sorted(self._metadata.playlists.items()))

        metadata_path = os.path.join(self.SCRIPT_PATH, self.METADATA_FILE)
        pickle.dump(self._metadata, open(metadata_path, 'wb'))

if __name__ == '__main__':

    # Only call fire.Fire(Pyrate) if arguments are provided
    import sys
    if len(sys.argv) > 1:
        fire.Fire(Pyrate)

    else:
        # print docstring of Pyrate class without indentation
        print(Pyrate.__doc__.strip())
        Pyrate()

        # print each function in pyrate class together with its docstring
        for name, func in Pyrate.__dict__.items():
            if callable(func) and not name.startswith('_'):
                # print ITALICISED function name and doc in nice table
                print(f'\033[3m{name}\033[0m\t{func.__doc__.strip()}')
