import os
import json
import threading
import requests
import re
from bs4 import BeautifulSoup
from datetime import datetime
from urllib.parse import urlparse, urljoin
from kivy.lang import Builder
from kivy.clock import Clock
from kivy.properties import (
    StringProperty,
    NumericProperty,
    ObjectProperty,
    ColorProperty,
    DictProperty,
    ListProperty,
    BooleanProperty
)
from kivy.uix.screenmanager import Screen
from kivy.core.window import Window
from kivy.uix.image import Image as KivyImage
from kivy.loader import Loader
from kivymd.app import MDApp
from kivymd.uix.card import MDCard
from kivymd.uix.snackbar import MDSnackbar, MDSnackbarText
from kivymd.uix.dialog import (
    MDDialog,
    MDDialogIcon,
    MDDialogHeadlineText,
    MDDialogSupportingText,
    MDDialogButtonContainer,
)
from kivymd.uix.button import MDButton, MDButtonText
from kivy.uix.scrollview import ScrollView
from kivy.uix.boxlayout import BoxLayout
from kivy.metrics import dp

# --- NOVEL ENGINE ---
class NovelEngine:
    def __init__(self, library_dir="NovelLibrary"):
        self.library_dir = library_dir
        os.makedirs(library_dir, exist_ok=True)
        self.session = requests.Session()
        # Modern Chrome User-Agent
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        })

    def get_all_online_links(self, url):
        """Fetches all chapter links from the novel's main page."""
        try:
            response = self.session.get(url, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')
            # Adjust this selector based on the website's structure
            links = soup.select('ul.chapters-list a, .chapter-item a') 
            return [urljoin(url, l['href']) for l in links if l.has_attr('href')]
        except Exception as e:
            print(f"Error fetching links: {e}")
            return []

    def get_library(self):
        novels = []
        if not os.path.exists(self.library_dir): return novels
        for folder in os.listdir(self.library_dir):
            # Skip the settings.json file if it's in the library directory
            if folder == 'settings.json':
                continue
            path = os.path.join(self.library_dir, folder, 'metadata.json')
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    data['safe_title'] = folder
                    novels.append(data)
        return novels

    def _download_cover(self, img_url, novel_dir, base_url):
        """Download and save cover image locally"""
        try:
            # Handle relative URLs
            if img_url.startswith('/'):
                parsed = urlparse(base_url)
                img_url = f"{parsed.scheme}://{parsed.netloc}{img_url}"
            
            # Get image extension from URL or default to .jpg
            ext = os.path.splitext(img_url)[1]
            if not ext or len(ext) > 5:
                ext = '.jpg'
            
            cover_filename = f"cover{ext}"
            cover_path = os.path.join(novel_dir, cover_filename)
            
            # Download image
            img_response = self.session.get(img_url, timeout=10)
            if img_response.status_code == 200:
                with open(cover_path, 'wb') as f:
                    f.write(img_response.content)
                return cover_filename
        except Exception as e:
            print(f"Failed to download cover: {e}")
        return None

    def _get_novel_info_from_chapter(self, chapter_soup, base_url):
        """Extract novel info from chapter page using breadcrumbs or links"""
        novel_url = None
        
        # Method 1: Breadcrumb navigation
        breadcrumb = chapter_soup.find('ol', class_='breadcrumb')
        if breadcrumb:
            links = breadcrumb.find_all('a')
            if len(links) >= 2:  # Usually Home > Novel Name > Chapter
                novel_link = links[1]
                novel_url = novel_link.get('href')
                return novel_url, None  # Don't return title
        
        # Method 2: "Back to Novel" links
        for a in chapter_soup.find_all('a', href=True):
            text = a.get_text().lower()
            if 'back to novel' in text or 'novel home' in text or 'main page' in text:
                novel_url = a['href']
                return novel_url, None
        
        # Method 3: Look for novel title in heading that links to main page
        for a in chapter_soup.find_all('a', href=True):
            if a.find('h1') or a.find('h2'):
                novel_url = a['href']
                return novel_url, None
        
        # Method 4: Construct from URL pattern
        parsed = urlparse(base_url)
        path_parts = parsed.path.split('/')
        if len(path_parts) > 2:
            # Take the first two parts (domain/novel-name)
            base_path = '/'.join(path_parts[:2]) + '.html'
            novel_url = f"{parsed.scheme}://{parsed.netloc}{base_path}"
        
        return novel_url, None

    def _get_first_chapter_url(self, soup, base_url):
        """Unified extraction for ReadNovelFull and Generic sites"""
        
        # 1. Target the Specific Chapter List Containers (ReadNovelFull)
        # These sites use specific IDs for the chapter tab or list
        chapter_container = soup.find('div', id='tab-chapters') or soup.find('div', id='list-chapter')
        
        if chapter_container:
            # Both sites use a 'ul' with class 'list-chapter' inside the container
            chapter_ul = chapter_container.find('ul', class_='list-chapter')
            if chapter_ul:
                first_li = chapter_ul.find('li')
                if first_li:
                    first_a = first_li.find('a', href=True)
                    if first_a:
                        return self._ensure_absolute_url(first_a['href'], base_url)

        # 2. Method: Table-based lists (Fallback for other sources)
        chapter_table = soup.find('table', id='chapters')
        if chapter_table:
            first_link = chapter_table.find('a', href=True)
            if first_link:
                return self._ensure_absolute_url(first_link['href'], base_url)

        # 3. Method: "Brute Force" Keyword Search (Final fallback)
        # Looks for links actually named "Chapter 1" or containing "chapter-1"
        for a in soup.find_all('a', href=True):
            href = a['href'].lower()
            text = a.get_text().lower()
            # We look for common patterns but exclude "Next Chapter" buttons
            if any(key in href or key in text for key in ['chapter-1', 'chapter-01', 'chapter1']):
                if 'next' not in href and 'last' not in href:
                    return self._ensure_absolute_url(a['href'], base_url)
        
        return None

    def _ensure_absolute_url(self, url, base_url):
        """Helper to convert relative links (/chapter-1) to full URLs"""
        if url.startswith('/'):
            parsed_uri = urlparse(base_url)
            return f"{parsed_uri.scheme}://{parsed_uri.netloc}{url}"
        return url
    

    def scrape_full_novel(self, start_url, log_cb, prog_cb, stop_event, start_ch=1, max_ch=None):
        try:
            # Extract domain from URL
            parsed_url = urlparse(start_url)
            domain = parsed_url.netloc
            log_cb(f"Connected to: {domain}", "info")
            
            # Convert inputs to integers safely
            start_num = int(start_ch) if start_ch else 1
            limit = int(max_ch) if max_ch else None
            
            log_cb(f"Fetching page...", "downloading")
            res = self.session.get(start_url, timeout=10)
            soup = BeautifulSoup(res.content, 'html.parser')
            
            # --- EXTRACT TITLE FROM URL FIRST (PRIORITY) ---
            # Parse the URL to extract a clean title
            parsed_url = urlparse(start_url)
            path = parsed_url.path
            
            # Remove trailing .html if present
            if path.endswith('.html'):
                path = path[:-5]
            
            # Split path and get the relevant parts
            path_parts = path.split('/')
            
            # Find the novel name part (skip empty strings and 'chapter' parts)
            novel_slug = None
            for part in path_parts:
                if part and 'chapter' not in part.lower() and len(part) > 5:
                    novel_slug = part
                    break
            
            # If no suitable part found, use the last non-empty part
            if not novel_slug:
                for part in reversed(path_parts):
                    if part:
                        novel_slug = part
                        break
            
            # Convert slug to title (replace hyphens with spaces and capitalize)
            if novel_slug:
                # Remove any numbering prefixes like "123-" or "123."
                novel_slug = re.sub(r'^\d+[\s\-\.]+', '', novel_slug)
                # Replace hyphens and underscores with spaces
                title_from_url = novel_slug.replace('-', ' ').replace('_', ' ').title()
                title = title_from_url
                log_cb(f"Title from URL: {title}", "success")
            else:
                title = "Unknown Novel"
                log_cb(f"Could not extract title from URL", "warning")
            
            # --- DETECT URL TYPE AND SOURCE ---
            domain_lower = start_url.lower()
            is_chapter_page = "chapter" in start_url.lower()
            is_readnovelfull = "readnovelfull" in domain_lower
            is_novelfull = "novelfull" in domain_lower and not is_readnovelfull
            is_freewebnovel = "freewebnovel" in domain_lower
            
            # Log the detected site
            if is_readnovelfull:
                log_cb(f"Site detected: ReadNovelFull.com", "downloading")
            elif is_novelfull:
                log_cb(f"Site detected: Novelfull.net", "downloading")
            elif is_freewebnovel:
                log_cb(f"Site detected: FreeWebNovel", "downloading")
            else:
                log_cb(f"Site detected: {domain}", "downloading")
            
            novel_soup = soup
            novel_page_url = start_url
            
            # If this is a chapter page, try to find the novel main page for metadata
            if is_chapter_page:
                log_cb(f"Chapter page detected, extracting additional info...", "downloading")
                novel_page_url, _ = self._get_novel_info_from_chapter(soup, start_url)  # We don't need the title from breadcrumb
                
                if novel_page_url and novel_page_url != start_url:
                    try:
                        novel_res = self.session.get(novel_page_url, timeout=10)
                        novel_soup = BeautifulSoup(novel_res.content, 'html.parser')
                        log_cb(f"Retrieved novel info from main page", "success")
                    except:
                        log_cb(f"Couldn't fetch novel main page, using current page", "info")
                        novel_soup = soup
            
            # --- EXTRACT COVER IMAGE ---
            cover_filename = None
            img_url = None

            #FreeWebNovel
            pic_div = novel_soup.find('div', class_='pic')
            if pic_div:
                img_tag = pic_div.find('img')
                if img_tag and img_tag.get('src'):
                    img_url = img_tag['src']

            # If not found, try readnovelfull/novelfull structure (div.book)
            if not img_url:
                cover_div = novel_soup.find('div', class_='book')
                if cover_div:
                    img_tag = cover_div.find('img')
                    if img_tag and img_tag.get('src'):
                        img_url = img_tag['src']

            #ReadNovelFull & NovelFull
            if img_url:
                log_cb(f"Found cover image: {img_url}", "info")
                
                # Setup novel directory for cover download
                safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
                novel_dir = os.path.join(self.library_dir, safe_title)
                os.makedirs(novel_dir, exist_ok=True)
                
                # Download the cover
                cover_filename = self._download_cover(img_url, novel_dir, novel_page_url)
                if cover_filename:
                    log_cb(f"Cover image saved: {cover_filename}", "success")

            
            # --- EXTRACT AUTHOR (from main page or current page) ---
            author = "Unknown Author"
            author_span = novel_soup.find('span', itemprop='author')

            # Author extraction based on source
            # ReadNovelFull Author Fetcher
            if is_readnovelfull:
                author_meta = author_span.find('meta', itemprop='name')
                if author_meta and author_meta.get('content'):
                    author = author_meta['content']

            # Novelfull Author Fetcher
            elif is_novelfull:
                info_div = novel_soup.find('div', class_='info')
                if info_div:
                    auth_h3 = info_div.find('h3', string=re.compile(r'Author:', re.I))
                    if auth_h3:
                        author_link = auth_h3.find_next('a')
                        if author_link: 
                            author = author_link.get_text(strip=True)
            elif is_freewebnovel:
                author_item = novel_soup.find('div', class_='item')
                if author_item:
                    span = author_item.find('span', title='Author')
                    if span:
                        right_div = author_item.find('div', class_='right')
                        if right_div:
                            author_link = right_div.find('a', class_='a1')
                            if author_link:
                                author = author_link.get_text(strip=True)
            
            log_cb(f"Author: {author}", "info")
            
            # --- EXTRACT SYNOPSIS (from main page or current page) ---
            synopsis = "No summary available."
            desc_div = novel_soup.find('div', class_='desc-text', itemprop='description')

            # ReadNovelFull Scraper
            if is_readnovelfull:
                desc_div = novel_soup.find('div', itemprop='description')
                if desc_div:
                    # ReadNovelFull uses <p> tags for the synopsis
                    paragraphs = desc_div.find_all('p')
                    if paragraphs:
                        # Join paragraphs with double newlines for a clean look in your reader
                        synopsis = "\n\n".join([p.get_text(strip=True) for p in paragraphs])
                    else:
                        # Fallback for plain text descriptions
                        synopsis = desc_div.get_text(strip=True)

            # Novelfull Scraper
            elif is_novelfull:
                desc_div = novel_soup.find('div', class_='desc-text')
                if desc_div:
                    paragraphs = desc_div.find_all('p')
                    if paragraphs:
                        synopsis = "\n\n".join([p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)])
                    else:
                        synopsis = desc_div.get_text(strip=True)

            #FreeWebNovel
            elif is_freewebnovel:
                desc_div = novel_soup.find('div', class_='m-desc')
                if desc_div:
                    inner = desc_div.find('div', class_='inner')
                    if inner:
                        paras = inner.find_all('p')
                        if paras:
                            synopsis = "\n\n".join(p.get_text(strip=True) for p in paras)
            
            # --- DIRECTORY SETUP (using title from URL) ---
            safe_title = re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')
            novel_dir = os.path.join(self.library_dir, safe_title)
            os.makedirs(novel_dir, exist_ok=True)

           # --- CHECK FOR EXISTING CHAPTERS ---
            existing_chapters = set()
            metadata_path = os.path.join(novel_dir, 'metadata.json')
            if os.path.exists(metadata_path):
                try:
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                        # Extract existing chapter numbers from filenames
                        for ch in existing_data.get('chapters', []):
                            filename = ch.get('filename', '')
                            # Extract chapter number from filename (ch_X.txt)
                            match = re.search(r'ch_(\d+)\.txt', filename)
                            if match:
                                existing_chapters.add(int(match.group(1)))
                        log_cb(f"Found {len(existing_chapters)} existing chapters", "info")
                except:
                    log_cb(f"Could not read existing metadata", "warning")

            
            # --- GET FIRST CHAPTER URL (if starting from main page) ---
            if not is_chapter_page:
                log_cb(f"Finding first chapter...", "downloading")
                
                if is_freewebnovel:
                    # FreeWebNovel specific extraction
                    ul = novel_soup.find('ul', class_='ul-list5')
                    if ul:
                        first_li = ul.find('li')
                        if first_li:
                            first_a = first_li.find('a', href=True)
                            if first_a:
                                first_chapter_path = first_a['href']
                                current_url = self._ensure_absolute_url(first_chapter_path, start_url)
                                log_cb(f"Found first chapter", "success")
                            else:
                                log_cb(f"Could not find chapter link in first li", "error")
                                return False, 0
                        else:
                            log_cb(f"No list items found in ul.ul-list5", "error")
                            return False, 0
                    else:
                        log_cb(f"Could not find ul.ul-list5", "error")
                        return False, 0
                else:
                    # Generic extraction (for ReadNovelFull, Novelfull, etc.)
                    first_chapter_path = self._get_first_chapter_url(novel_soup, start_url)
                    if first_chapter_path:
                        if first_chapter_path.startswith('/'):
                            parsed = urlparse(start_url)
                            base_url = f"{parsed.scheme}://{parsed.netloc}"
                            current_url = base_url + first_chapter_path
                        else:
                            current_url = requests.compat.urljoin(start_url, first_chapter_path)
                        log_cb(f"Found first chapter", "success")
                    else:
                        log_cb(f"Could not find first chapter link", "error")
                        return False, 0
            else:
                # Starting from a chapter page
                current_url = start_url
            
            # --- CHAPTER DOWNLOAD LOOP ---
            chapters = []
            count = start_num - 1  # Adjust for start_ch

            # Load existing chapters if any
            if os.path.exists(metadata_path):
                try:
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                        chapters = existing_data.get('chapters', [])
                except:
                    pass

            while current_url and not stop_event.is_set():
                count += 1
                if limit and (count - start_num + 1) > limit: 
                    log_cb(f"Reached max chapters limit ({limit})", "success")
                    break
                # Check if chapter already exists
                if count in existing_chapters:
                    log_cb(f"[SKIPPED] Chapter {count} already exists, skipping...", "info")
                    
                    # Still need to find next chapter URL to continue
                    res = self.session.get(current_url, timeout=10)
                    soup = BeautifulSoup(res.content, 'html.parser')
                    
                    # Find next chapter link
                    next_link = None
                    for a in soup.find_all('a', href=True):
                        txt = a.get_text().lower()
                        attrs = str(a.get('class', [])).lower() + a.get('id', '').lower()
                        
                        if ('next' in txt or 'next chapter' in txt or 
                            'next' in attrs or 'next_chapter' in attrs):
                            next_link = a['href']
                            break
                    
                    if not next_link:
                        log_cb(f"No more chapters found", "info")
                        break
                    
                    # Handle relative URLs
                    if next_link.startswith('/'):
                        parsed = urlparse(current_url)
                        base_url = f"{parsed.scheme}://{parsed.netloc}"
                        current_url = base_url + next_link
                    else:
                        current_url = requests.compat.urljoin(current_url, next_link)
                    
                    prog_cb(count, limit if limit else count)
                    continue
                
                log_cb(f"Downloading Chapter {count}...", "downloading")
                res = self.session.get(current_url, timeout=10)
                soup = BeautifulSoup(res.content, 'html.parser')
                
                # Chapter title extraction
                display_title = f"Chapter {count}"
                title_tag = soup.find(['h1', 'h2', 'span'], class_=re.compile(r'chapter-title|chr-title|entry-title', re.I))
                if title_tag:
                    raw_name = title_tag.get_text(strip=True)
                    clean_name = re.sub(r'^Chapter\s*\d+\s*[:\-]*\s*', '', raw_name, flags=re.I).strip()
                    if clean_name: 
                        display_title = f"Chapter {count}: {clean_name}"

                # Content extraction
                paragraphs = soup.find_all('p')
                content = "\n\n".join([p.get_text() for p in paragraphs if len(p.get_text().strip()) > 5])
                
                filename = f"ch_{count}.txt"
                with open(os.path.join(novel_dir, filename), 'w', encoding='utf-8') as f:
                    f.write(content)
                
                chapters.append({'title': display_title, 'filename': filename})
                log_cb(f"Saved: {display_title}", "success" if count % 10 == 0 else "info")
                prog_cb(count, limit if limit else count)

                # Find next chapter link
                next_link = None
                for a in soup.find_all('a', href=True):
                    txt = a.get_text().lower()
                    attrs = str(a.get('class', [])).lower() + a.get('id', '').lower()
                    
                    # Check for next chapter indicators
                    if ('next' in txt or 'next chapter' in txt or 
                        'next' in attrs or 'next_chapter' in attrs):
                        next_link = a['href']
                        break
                
                if not next_link:
                    log_cb(f"No more chapters found", "info")
                    break
                
                # Handle relative URLs
                if next_link.startswith('/'):
                    parsed = urlparse(current_url)
                    base_url = f"{parsed.scheme}://{parsed.netloc}"
                    current_url = base_url + next_link
                else:
                    current_url = requests.compat.urljoin(current_url, next_link)

            # --- SAVE METADATA ---
            metadata = {
                'title': title,  # This is the title extracted from URL
                'author': author, 
                'synopsis': synopsis, 
                'url': start_url, 
                'chapters': chapters,
                'cover': cover_filename  # Add cover filename to metadata
            }
            with open(os.path.join(novel_dir, 'metadata.json'), 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2)
            
            log_cb(f"Download complete! Total chapters: {len(chapters)}", "success")
            return True, count

        except Exception as e:
            log_cb(f"Error: {str(e)[:100]}", "error")
            return False, 0


# --- UI DEFINITION ---
KV = '''
<NovelCard>:
    orientation: "horizontal"
    size_hint_x: 1
    size_hint_y: None
    # Adapt height: 15% of screen height, but never smaller than 80dp or larger than 140dp
    height: max(dp(80), min(app.root.height * 0.15, dp(140)))
    padding: "8dp"
    spacing: "8dp"
    md_bg_color: self.theme_cls.surfaceColor
    radius: [12,]
    ripple_behavior: True
    elevation: 1

    # --- 1. DYNAMIC CHECKBOX ---
    MDBoxLayout:
        size_hint: (None, 1)
        # Checkbox takes 0 width when not in selection mode
        width: "48dp" if app.selection_mode else "0dp"
        opacity: 1 if app.selection_mode else 0
        disabled: not app.selection_mode
        MDCheckbox:
            id: check
            active: True if root.novel_data.get('safe_title', '') in app.selected_novels else False
            pos_hint: {"center_y": .5}
            on_release: app.toggle_novel_selection(root.novel_data)

    # --- 2. ADAPTABLE COVER (Ration-based) ---
    MDAnchorLayout:
        size_hint: (0.25, 1) # Takes exactly 25% of the card width
        anchor_x: "center"
        anchor_y: "center"
        FitImage:
            id: cover_img
            source: root.cover_source
            size_hint: 0.9, 0.9 # Small internal padding
            radius: [8,]

    # --- 3. ADAPTABLE TEXT SECTION ---
    MDBoxLayout:
        orientation: "vertical"
        size_hint: (0.75, 1) # Takes the remaining 75% width
        padding: ["8dp", "4dp", "4dp", "4dp"]
        spacing: "2dp"
        
        MDLabel:
            text: root.title
            bold: True
            font_style: "Title"
            role: "small"
            # Allows font to wrap and label to grow
            adaptive_height: True 
            max_lines: 2
            theme_text_color: "Custom"
            text_color: self.theme_cls.onSurfaceColor

        MDLabel:
            text: root.novel_data.get('author', 'Unknown Author')
            font_style: "Body"
            role: "small"
            theme_text_color: "Secondary"
            adaptive_height: True
            max_lines: 1

        # Push elements to top
        Widget:


MDBoxLayout:
    orientation: "vertical"
    md_bg_color: app.bg_color

    MDScreenManager:
        id: main_sm
        Screen:
            name: "splash"
            # Inside Screen: name: "splash"
            MDBoxLayout:
                orientation: "vertical"
                md_bg_color: app.bg_color
                Widget:
                Image:
                    source: "icon.png"
                    size_hint: (None, None)
                    size: ("200dp", "200dp")
                    pos_hint: {"center_x": .5}
                MDLabel:
                    id: splash_status
                    text: app.splash_status_text # This will be updated by Python
                    halign: "center"
                    theme_text_color: "Custom"
                    text_color: app.reader_fg
                    font_style: "Body"
                    role: "medium"
                Widget:
        Screen:
            name: "main_view"
            MDBoxLayout:
                orientation: "vertical"
                # Inside Screen "main_view" -> MDTopAppBar
                MDTopAppBar:
                    type: "small"
                    MDTopAppBarTitle:
                        text: "Novel DR"
                    MDTopAppBarTrailingButtonContainer:
                        # Only show the button if the current screen in inner_manager is 'library'
                        MDActionTopAppBarButton:
                            icon: "delete-sweep" if app.selection_mode else "dots-vertical"
                            opacity: 1 if inner_manager.current == "library" else 0
                            disabled: inner_manager.current != "library"
                            on_release: app.show_library_options()
            
                MDScreenManager:
                    id: inner_manager

                    # Inside the "library" Screen, after the ScrollView and before the Floating Selection Bar

                    Screen:
                        name: "library"
                        MDRelativeLayout:
                            ScrollView:
                                MDAnchorLayout:
                                    anchor_x: 'center'
                                    size_hint_y: None
                                    height: library_list.height
                                    
                                    # -- CHANGED FROM STACK LAYOUT TO VERTICAL BOX LAYOUT FOR LISTS --
                                    MDBoxLayout:
                                        id: library_list # renamed from grid
                                        orientation: 'vertical'
                                        size_hint_x: None
                                        # Limit max width of list for larger screens
                                        width: min(self.parent.width, 1000) 
                                        padding: "16dp"      # Better list padding
                                        spacing: "12dp"      # Gap between cards
                                        size_hint_y: None
                                        height: self.minimum_height

                            # Empty Library Message (shown when no novels)
                            MDBoxLayout:
                                id: empty_library_msg
                                orientation: "vertical"
                                size_hint: None, None
                                size: "300dp", "300dp"
                                pos_hint: {"center_x": .5, "center_y": .5}
                                spacing: "20dp"
                                opacity: 0
                                disabled: True

                                Image:
                                    source: "shook.png"
                                    size_hint: None, None
                                    size: "150dp", "150dp"
                                    pos_hint: {"center_x": .5}

                                MDLabel:
                                    text: "The Library is Empty"
                                    halign: "center"
                                    font_style: "Headline"
                                    role: "small"
                                    bold: True
                                    theme_text_color: "Custom"
                                    text_color: app.reader_fg
                                    size_hint_y: None
                                    height: self.texture_size[1]

                                MDLabel:
                                    text: "Add your first novel to start reading!"
                                    halign: "center"
                                    theme_text_color: "Secondary"
                                    size_hint_y: None
                                    height: self.texture_size[1]

                                MDButton:
                                    style: "filled"
                                    pos_hint: {"center_x": .5}
                                    size_hint_x: 0.6
                                    on_release: app.go_to_add_tab()
                                    MDButtonText:
                                        text: "Add Novel"
                                    MDButtonIcon:
                                        icon: "book-plus"

                            # Floating Selection Bar
                            MDCard:
                                size_hint: .9, None
                                height: "64dp"
                                pos_hint: {"center_x": .5, "y": .02}
                                md_bg_color: app.theme_cls.surfaceColor
                                elevation: 4
                                opacity: 1 if (app.selection_mode and len(app.selected_novels) > 0) else 0
                                disabled: not (app.selection_mode and len(app.selected_novels) > 0)
                                padding: "12dp"
                                radius: [16, 16, 16, 16]

                                MDBoxLayout:
                                    orientation: "horizontal"
                                    spacing: "10dp"
                                    vertical_align: "center"

                                    MDLabel:
                                        text: f"Selected: {len(app.selected_novels)}"
                                        bold: True
                                    
                                    MDButton:
                                        style: "outlined"
                                        on_release: app.exit_selection_mode()
                                        MDButtonText:
                                            text: "Cancel"
                                    
                                    MDButton:
                                        style: "filled"
                                        theme_bg_color: "Custom"
                                        md_bg_color: [1, 0.2, 0.2, 1]
                                        on_release: app.show_delete_confirmation()
                                        MDButtonText:
                                            text: "Delete"
                    
                    # ----------------------------------------------------------------------
                    # UPDATES SCREEN - NUMERIC SELECTOR WITH INCREMENTAL PROGRESS BAR
                    # ----------------------------------------------------------------------
                    Screen:
                        name: "updates"
                        ScrollView:
                            MDBoxLayout:
                                orientation: "vertical"
                                padding: "16dp"
                                spacing: "12dp"
                                adaptive_height: True

                                # Header
                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "8dp"
                                    MDIcon:
                                        icon: "bookshelf"
                                        pos_hint: {"center_y": .5}
                                    MDLabel:
                                        text: "Library Updates"
                                        font_style: "Headline"
                                        role: "small"
                                        bold: True
                                        adaptive_height: True

                                MDDivider:

                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"
                                    MDIcon:
                                        icon: "book-open-variant"
                                        pos_hint: {"center_y": .6}
                                    MDLabel:
                                        text: "Library Lists"
                                        font_size: "20sp"
                                        bold: True

                                MDCard:
                                    padding: "16dp"
                                    adaptive_height: True
                                    style: "elevated"
                                    MDBoxLayout:
                                        orientation: "vertical"
                                        adaptive_height: True
                                        spacing: "4dp"

                                        # Read-only novel list
                                        MDLabel:
                                            text: "Available Novels"
                                            bold: True
                                            font_style: "Title"
                                            role: "medium"
                                            adaptive_height: True

                                        ScrollView:
                                            size_hint_y: None
                                            height: "150dp"
                                            MDBoxLayout:
                                                id: update_novel_list
                                                orientation: "vertical"
                                                adaptive_height: True
                                                spacing: "4dp"
                                                padding: "8dp"

                                MDDivider:

                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"
                                    MDIcon:
                                        icon: "book-search-outline"
                                        pos_hint: {"center_y": .6}
                                    MDLabel:
                                        text: "Enter novel number from list above:"
                                        font_size: "20sp"
                                        bold: True
    
                                # Row 1: Novel Number Input
                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"
                                    
                                    MDTextField:
                                        id: novel_number_input
                                        mode: "outlined"
                                        size_hint_x: 1
                                        size_hint_y: None
                                        height: "48dp"
                                        disabled: app.is_updating
                                        MDTextFieldHintText:
                                            text: "Enter Novel Number (e.g., 1, 2, 3...)"

                                # Row 2: Max Chapters + Initiate Update side by side
                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"
                                    padding: [0, "8dp", 0, 0]  # top padding to separate from first row

                                    # Max Chapters text field (left)
                                    MDTextField:
                                        id: max_ch_update_input
                                        mode: "outlined"
                                        size_hint_x: 0.5
                                        size_hint_y: None
                                        height: "48dp"
                                        disabled: app.is_updating
                                        MDTextFieldHintText:
                                            text: "Max Chapters"

                                    # Initiate Update button (right)
                                    MDButton:
                                        id: update_btn
                                        style: "filled"
                                        size_hint_x: 0.5
                                        size_hint_y: None
                                        height: "48dp"
                                        on_release: app.start_novel_update()
                                        disabled: app.is_updating
                                        MDButtonIcon:
                                            icon: "update"
                                        MDButtonText:
                                            text: "Initiate Update"
                                            
                                MDDivider:

                                # Timer + Progress bar (side by side)
                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"

                                    MDIcon:
                                        icon: "progress-clock"
                                        pos_hint: {"center_y": .6}

                                    MDLabel:
                                        id: update_timer
                                        text: "000:00:000"          # MM:SS:mmm placeholder
                                        font_style: "Title"
                                        role: "medium"
                                        bold: True
                                        size_hint_x: 0.5

                                    MDLinearProgressIndicator:
                                        id: update_progress_bar
                                        type: app.update_bar_type          # dynamic type
                                        value: app.update_progress if app.update_bar_type == "determinate" else 0
                                        size_hint_x: 0.5
                                        size_hint_y: None
                                        height: "15dp"
                                        opacity: 0
                                        disabled: True

                                MDDivider:

                                # Activity log (dedicated to Updates)
                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"

                                    MDIcon:
                                        icon: "sync"
                                        pos_hint: {"center_y": .5}
                                        size_hint: None, None
                                        size: "24dp", "24dp"
                                        theme_icon_color: "Custom"
                                        icon_color: app.reader_fg

                                    MDLabel:
                                        text: "Activity Log"
                                        bold: True
                                        font_style: "Title"
                                        role: "medium"
                                        adaptive_height: True

                                MDCard:
                                    style: "outlined"
                                    size_hint_y: None
                                    height: "200dp"
                                    padding: 0
                                    spacing: 0

                                    ScrollView:
                                        MDBoxLayout:
                                            id: update_log_box
                                            orientation: "vertical"
                                            adaptive_height: True
                                            spacing: "2dp"
                                            padding: "8dp"

                                MDButton:
                                    style: "outlined"
                                    pos_hint: {"center_x": .5}
                                    size_hint_x: 0.4
                                    on_release: app.clear_update_log()
                                    MDButtonText:
                                        text: "Clear Log"

                    # ----------------------------------------------------------------------
                    # END OF UPDATES SCREEN
                    # ----------------------------------------------------------------------

                    Screen:
                        name: "add"
                        ScrollView:
                            MDBoxLayout:
                                orientation: "vertical"
                                padding: "16dp"
                                spacing: "12dp"
                                adaptive_height: True
                                
                                MDBoxLayout:
                                    orientation: "horizontal"
                                    adaptive_height: True
                                    spacing: "8dp"
                                    MDIcon:
                                        icon: "cloud-download"
                                        pos_hint: {"center_y": .5}
                                        theme_icon_color: "Custom"
                                        icon_color: app.reader_fg
                                    MDLabel:
                                        text: "Download Novel"
                                        font_style: "Headline"
                                        role: "small"
                                        bold: True
                                        adaptive_height: True
                                MDLabel:
                                    text: "Supported Websites:\\nReadNovelFull - NovelFull - FreeWebNovel"
                                    font_style: "Title"
                                    role: "medium"
                                    bold: True
                                    adaptive_height: True
                                    pos_hint: {"center_y": .5}
                                        
                                
                                MDTextField:
                                    id: url_input
                                    mode: "outlined"
                                    MDTextFieldHintText:
                                        text: "Paste Novel URL"
                                
                                MDTextField:
                                    id: start_ch_input
                                    mode: "outlined"
                                    MDTextFieldHintText:
                                        text: "Starting Chapter Number"
                                        
                                MDTextField:
                                    id: max_ch_input
                                    mode: "outlined"
                                    MDTextFieldHintText:
                                        text: "Max Chapters (Optional)"
                                        
                                MDStackLayout:
                                    adaptive_height: True
                                    spacing: "8dp"
                                    padding: "4dp"
                                    orientation: 'lr-tb'  # Left-to-Right, Top-to-Bottom
                                    MDButton:
                                        style: "filled"
                                        on_release: app.start_download(url_input.text, start_ch_input.text, max_ch_input.text)
                                        disabled: app.is_downloading
                                        MDButtonText:
                                            text: "Start Download"  
                                    MDButton:
                                        style: "outlined"
                                        on_release: app.stop_event.set()
                                        disabled: not app.is_downloading
                                        MDButtonText:
                                            text: "Halt"
                                    MDButton:
                                        style: "outlined"
                                        on_release: app.clear_inputs()
                                        MDButtonText:
                                            text: "Clear"

                                MDDivider:

                                MDBoxLayout:
                                    orientation: "vertical"
                                    adaptive_height: True
                                    spacing: "4dp"

                                    MDBoxLayout:
                                        orientation: "horizontal"
                                        adaptive_height: True
                                        spacing: "8dp"
                                        
                                        MDIcon:
                                            icon: "chart-bar"
                                            pos_hint: {"center_y": .5}
                                            theme_icon_color: "Custom"
                                            icon_color: app.reader_fg

                                        MDLabel:
                                            text: f"Overall Progress: [{app.prog_ch_name}] ({int(app.prog_ch_val)}%) "
                                            font_style: "Title"
                                            role: "medium"
                                            bold: True
                                            adaptive_height: True
                                            pos_hint: {"center_y": .5}

                                    MDLinearProgressIndicator:
                                        id: prog_bar
                                        value: app.prog_ch_val
                                        size_hint_y: None
                                        height: "15dp"

                                    MDDivider:

                                    MDBoxLayout:
                                        orientation: "vertical"
                                        adaptive_height: True
                                        spacing: "12dp"

                                        MDBoxLayout:
                                            orientation: "horizontal"
                                            adaptive_height: True
                                            spacing: "8dp"

                                            MDIcon:
                                                icon: "sync"
                                                pos_hint: {"center_y": .5}
                                                size_hint: None, None
                                                size: "24dp", "24dp"
                                                theme_icon_color: "Custom"
                                                icon_color: app.reader_fg

                                            MDLabel:
                                                text: "Activity Log"
                                                font_size: "20sp"
                                                bold: True
                                                adaptive_height: True
                                                pos_hint: {"center_y": .5}

                                        MDCard:
                                            orientation: "vertical"
                                            size_hint_y: None
                                            height: "150dp"
                                            md_bg_color: [0, 0, 0, 0.2]
        
                                            ScrollView:
                                                MDBoxLayout:
                                                    id: log_box
                                                    orientation: "vertical"
                                                    adaptive_height: True
                                                    spacing: "4dp"

                                        MDButton:
                                            style: "outlined"
                                            pos_hint: {"center_x": .5}
                                            on_release: app.clear_logs()
                                            MDButtonText:
                                                text: "Clear Log"
                                       
                    Screen:
                        name: "settings"
                        ScrollView:
                            MDBoxLayout:
                                orientation: "vertical"
                                padding: "24dp"
                                spacing: "24dp"
                                adaptive_height: True
                                
                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"
                                    MDIcon:
                                        icon: "chart-arc"
                                        pos_hint: {"center_y": .5}
                                    MDLabel:
                                        text: "Library Statistics"
                                        font_size: "20sp"
                                        bold: True
                                
                                MDCard:
                                    padding: "16dp"
                                    adaptive_height: True
                                    style: "elevated"
                                    MDBoxLayout:
                                        orientation: "vertical"
                                        adaptive_height: True
                                        spacing: "4dp"
                                        MDLabel:
                                            text: f"Total Novels: {app.stats['novels']}"
                                            adaptive_height: True
                                            bold: True
                                        MDLabel:
                                            text: f"Total Chapters: {app.stats['chapters']}"
                                            adaptive_height: True
                                            theme_text_color: "Secondary"

                                MDDivider:
                                
                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"
                                    MDIcon:
                                        icon: "palette-outline"
                                        pos_hint: {"center_y": .5}
                                    MDLabel:
                                        text: "App Theme"
                                        font_size: "20sp"
                                        bold: True
                                
                                MDStackLayout:
                                    adaptive_height: True
                                    spacing: "12dp"
                                    orientation: 'lr-tb'
                                    MDButton:
                                        style: "filled"
                                        on_release: app.change_theme("Dark")
                                        MDButtonIcon:
                                            icon: "brightness-3"
                                        MDButtonText:
                                            text: "Dark"
                                    MDButton:
                                        style: "filled"
                                        on_release: app.change_theme("Light")
                                        MDButtonIcon:
                                            icon: "brightness-7"
                                        MDButtonText:
                                            text: "Light"
                                    MDButton:
                                        style: "filled"
                                        on_release: app.change_theme("Sepia")
                                        MDButtonIcon:
                                            icon: "book-open-variant"
                                        MDButtonText:
                                            text: "Sepia"

                                MDDivider:

                                MDBoxLayout:
                                    adaptive_height: True
                                    spacing: "12dp"
                                    MDIcon:
                                        icon: "information-outline"
                                        pos_hint: {"center_y": .5}
                                    MDLabel:
                                        text: "About App"
                                        font_size: "20sp"
                                        bold: True
                                
                                MDLabel:
                                    text: "• Download novels from 3 popular sites:\\n > [ ReadNovelFull ]\\n > [ NovelFull ]\\n > [ FreeWebNovel ]\\n• Beautiful in-app reading experience\\n• Reading progress tracking with [ Continue ]\\n• Chapter caching for faster loading\\n• Adjustable global themes:\\n [ Dark, Light, Sepia ]\\n• Offline reading capability\\n• Dynamic novel deletion system"
                                    theme_text_color: "Secondary"
                                    adaptive_height: True
                                    halign: "left"

                MDNavigationBar:
                    on_switch_tabs: app.on_switch_tabs(*args)

                    MDNavigationItem:
                        name: "library"
                        active: True
                        MDNavigationItemIcon:
                            icon: "bookshelf"
                        MDNavigationItemLabel:
                            text: "Library"
                            
                    # Under MDNavigationBar
                    MDNavigationItem:
                        name: "updates"
                        on_active: if self.active: app.generate_fetch_cache()

                        MDNavigationItemIcon:
                            icon: "update"

                        MDNavigationItemLabel:
                            text: "Novel Updates"
   
                    MDNavigationItem:
                        name: "add"
                        disabled: app.is_updating   # Disable Add tab during update
                        MDNavigationItemIcon:
                            icon: "book-plus-multiple-outline"
                        MDNavigationItemLabel:
                            text: "Add Novel"
                    MDNavigationItem:
                        name: "settings"
                        MDNavigationItemIcon:
                            icon: "cog"
                        MDNavigationItemLabel:
                            text: "Settings"

        Screen:
            name: "chapters"
            MDBoxLayout:
                orientation: "vertical"
                md_bg_color: app.bg_color

                MDTopAppBar:
                    type: "small"
                    MDTopAppBarLeadingButtonContainer:
                        MDActionTopAppBarButton:
                            icon: "arrow-left"
                            on_release: app.go_back()
                    MDTopAppBarTitle:
                        text: getattr(app, 'current_novel_title', "Novel Details")

                ScrollView:
                    do_scroll_x: False

                    MDBoxLayout:
                        orientation: "vertical"
                        adaptive_height: True
                        padding: "16dp"
                        spacing: "16dp"

                        # Novel Title section with "Title:" label
                        MDLabel:
                            text: "Title:"
                            bold: True
                            font_style: "Title"
                            role: "medium"
                            adaptive_height: True

                        MDCard:
                            style: "outlined"
                            padding: "12dp"
                            adaptive_height: True
                            MDLabel:
                                id: novel_title_label
                                text: "Loading..."
                                theme_text_color: "Secondary"
                                adaptive_height: True
                                font_style: "Body"
                                role: "large"
                        
                        # Author section with "Author:" label
                        MDLabel:
                            text: "Author:"
                            bold: True
                            font_style: "Title"
                            role: "medium"
                            adaptive_height: True

                        MDCard:
                            style: "outlined"
                            padding: "12dp"
                            adaptive_height: True
                            MDLabel:
                                id: author_label
                                text: "Loading..."
                                theme_text_color: "Secondary"
                                adaptive_height: True
                                font_style: "Body"
                                role: "large"

                        # Summary section with See More dropdown
                        MDLabel:
                            text: "Summary:"
                            bold: True
                            font_style: "Title"
                            role: "medium"
                            adaptive_height: True

                        MDCard:
                            style: "outlined"
                            padding: "12dp"
                            adaptive_height: True
                            orientation: "vertical"
                            
                            MDBoxLayout:
                                orientation: "vertical"
                                adaptive_height: True
                                spacing: "8dp"
                                
                                # Summary text (truncated)
                                MDLabel:
                                    id: summary_label
                                    text: "Summary content..."
                                    theme_text_color: "Secondary"
                                    adaptive_height: True
                                    font_style: "Body"
                                    role: "large"
                                    max_lines: 3
                                
                                # See More / See Less button
                                MDBoxLayout:
                                    adaptive_height: True
                                    size_hint_y: None
                                    height: "32dp"
                                    pos_hint: {"center_x": .5}
                                    
                                    MDButton:
                                        id: see_more_btn
                                        style: "text"
                                        pos_hint: {"center_x": .5}
                                        size_hint: None, None
                                        width: "100dp"
                                        height: "32dp"
                                        on_release: app.toggle_summary()
                                        MDButtonText:
                                            id: see_more_btn_text
                                            text: "See More"
                                            theme_text_color: "Custom"
                                            text_color: app.theme_cls.primaryColor

                        # --- NEW READING PROGRESS CARD ---
                        MDCard:
                            style: "elevated"
                            padding: "16dp"
                            spacing: "12dp"
                            orientation: "vertical"
                            adaptive_height: True
                            size_hint_x: 1
                            md_bg_color: self.theme_cls.surfaceColor

                            # Header with icon
                            MDBoxLayout:
                                orientation: "horizontal"
                                spacing: "8dp"
                                adaptive_height: True
                                
                                MDIcon:
                                    icon: "bookmark-outline"
                                    theme_icon_color: "Custom"
                                    icon_color: app.theme_cls.primaryColor
                                    size_hint: None, None
                                    size: "24dp", "24dp"
                                    pos_hint: {"center_y": .5}
                                    
                                MDLabel:
                                    text: "Reading Progress"
                                    font_style: "Title"
                                    role: "medium"
                                    bold: True
                                    adaptive_height: True
                                    pos_hint: {"center_y": .5}

                            # Chapters count + progress bar (inline)
                            MDBoxLayout:
                                orientation: "horizontal"
                                adaptive_height: True
                                spacing: "12dp"
                                
                                MDLabel:
                                    id: progress_chapters_label
                                    text: "Chapters: 0/0"
                                    theme_text_color: "Secondary"
                                    adaptive_height: True
                                    size_hint_x: 0.4
                                    valign: "center"
                                
                                MDLinearProgressIndicator:
                                    id: progress_bar
                                    value: 0
                                    size_hint_y: None
                                    height: "25dp"
                                    radius: [4,]
                                    size_hint_x: 0.6

                            # Last read + Continue button
                            MDBoxLayout:
                                orientation: "horizontal"
                                adaptive_height: True
                                spacing: "12dp"
                                
                                MDLabel:
                                    id: last_read_label
                                    text: "Last Read: None"
                                    theme_text_color: "Secondary"
                                    adaptive_height: True
                                    size_hint_x: 0.7
                                    valign: "center"
                                
                                MDButton:
                                    id: continue_reading_btn
                                    style: "filled"
                                    size_hint_x: 0.3
                                    on_release: app.continue_reading()
                                    MDButtonText:
                                        text: "Continue"
                                        theme_text_color: "Custom"
                                        text_color: app.theme_cls.surfaceColor

                        MDDivider:
                        
                        # Chapter List section
                        MDLabel:
                            text: "Chapter List"
                            bold: True
                            font_style: "Title"
                            role: "medium"
                            adaptive_height: True

                        MDBoxLayout:
                            id: chapter_button_grid
                            orientation: "vertical"
                            adaptive_height: True
                            spacing: "8dp"

        Screen:
            name: "reader"
            md_bg_color: app.reader_bg
            MDBoxLayout:
                orientation: "vertical"
                MDTopAppBar:
                    type: "small"
                    md_bg_color: app.reader_bg
                    MDTopAppBarLeadingButtonContainer:
                        MDActionTopAppBarButton:
                            icon: "arrow-left"
                            on_release: app.go_back()
                            theme_icon_color: "Custom"
                            icon_color: app.reader_fg
                    MDTopAppBarTitle:
                        text: app.current_ch_title
                        theme_text_color: "Custom"
                        text_color: app.reader_fg
                    
                ScrollView:
                    MDLabel:
                        id: reader_content
                        text: app.current_content
                        padding: "24dp", "24dp"
                        size_hint_y: None
                        height: self.texture_size[1]
                        font_size: str(app.reader_font_size) + "sp"
                        theme_text_color: "Custom"
                        text_color: app.reader_fg
                        line_height: app.reader_line_spacing

                # --- NAVIGATION BAR WITH SPACER ---
                MDDivider:
                
                MDBoxLayout:
                    adaptive_height: True
                    padding: ["16dp", "8dp", "16dp", "16dp"]
                    md_bg_color: app.reader_bg
                    orientation: "horizontal"
                    
                    MDButton:
                        style: "outlined"
                        on_release: app.change_chapter(-1)
                        MDButtonText:
                            text: "Previous"
                            theme_text_color: "Custom"
                            text_color: app.reader_fg
                            
                    # This Widget pushes the buttons to the far left and right
                    Widget:
                    
                    MDButton:
                        style: "outlined"
                        on_release: app.change_chapter(1)
                        MDButtonText:
                            text: "Next"
                            theme_text_color: "Custom"
                            text_color: app.reader_fg
'''
class NovelCard(MDCard):
    title = StringProperty()
    novel_data = ObjectProperty()
    cover_source = StringProperty('')
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.novel_data and 'cover' in self.novel_data and self.novel_data['cover']:
            cover_path = os.path.join(
                MDApp.get_running_app().engine.library_dir,
                self.novel_data['safe_title'],
                self.novel_data['cover']
            )
            if os.path.exists(cover_path):
                self.cover_source = cover_path

    def on_release(self):
        app = MDApp.get_running_app()
        if app.selection_mode:
            app.toggle_novel_selection(self.novel_data)
        else:
            app.open_novel(self.novel_data)


class NovelApp(MDApp):
    prog_ch_val = NumericProperty(0)
    prog_ch_name = StringProperty("Idle")
    is_downloading = ObjectProperty(False)
    reader_font_size = NumericProperty(15)
    bg_color = ColorProperty([0.06, 0.06, 0.06, 1])
    reader_bg = ColorProperty([0.06, 0.06, 0.06, 1]) 
    reader_fg = ColorProperty([1, 1, 1, 1])
    current_ch_title = StringProperty("Chapter")
    current_content = StringProperty("")
    stats = DictProperty({"novels": 0, "chapters": 0})
    selection_mode = ObjectProperty(False)
    selected_novels = ListProperty([])
    current_novel_title = StringProperty("Novel Details")
    reading_progress = DictProperty({})
    summary_expanded = ObjectProperty(False)
    reader_line_spacing = NumericProperty(1)
    splash_status_text = StringProperty("Starting...")
    fetch_list_text = StringProperty("Scanning library...")
    fetch_novel_count = NumericProperty(0)
    update_seconds = NumericProperty(0)
    # Properties for updates screen
    is_updating = BooleanProperty(False)
    update_progress = NumericProperty(0)          # 0-100 for determinate bar
    update_bar_type = StringProperty("indeterminate")  # "indeterminate" or "determinate"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.selected_novel_for_update = None   # for updates screen
        self.chapters_completed = 0              # for determinate progress
        self.total_chapters = None                # for determinate progress
        
    def show_library_options(self):
        # Toggle selection mode
        self.selection_mode = not self.selection_mode
        self.selected_novels = [] 

    def toggle_novel_selection(self, novel_data):
        """Adds or removes a novel from the deletion list using its data dictionary."""
        if not self.selection_mode:
            return

        safe_title = novel_data['safe_title']
        
        new_selection = list(self.selected_novels)
        
        if safe_title in new_selection:
            new_selection.remove(safe_title)
        else:
            new_selection.append(safe_title)
        
        self.selected_novels = new_selection
        
    def exit_selection_mode(self):
        """Called by the 'Cancel' button on the prompt bar."""
        self.selection_mode = False
        self.selected_novels = []

    def show_delete_confirmation(self):
        from kivy.uix.relativelayout import RelativeLayout

        # Container that will hold both buttons
        button_container = RelativeLayout(size_hint_y=None, height="48dp")

        # Cancel button – anchored to left edge
        cancel_btn = MDButton(
            MDButtonText(text="Cancel"),
            style="outlined",
            size_hint=(None, None),
            size=("80dp", "40dp"),
            pos_hint={"x": 0},
            on_release=lambda x: self.dialog.dismiss()
        )

        # Delete button – anchored to right edge
        delete_btn = MDButton(
            MDButtonText(text="Delete"),
            style="filled",
            theme_bg_color="Custom",
            md_bg_color=[1, 0, 0, 1],
            size_hint=(None, None),
            size=("80dp", "40dp"),
            pos_hint={"right": 1},
            on_release=self.delete_selected_novels
        )

        button_container.add_widget(cancel_btn)
        button_container.add_widget(delete_btn)

        self.dialog = MDDialog(
            MDDialogIcon(icon="delete-alert"),
            MDDialogHeadlineText(text="Confirm Deletion"),
            MDDialogSupportingText(text=f"Remove {len(self.selected_novels)} novel/s from your Library?"),
            MDDialogButtonContainer(button_container),
        )
        self.dialog.open()

    def delete_selected_novels(self, *args):
        """Actual file deletion logic."""
        import shutil
        for folder in self.selected_novels:
            path = os.path.join(self.engine.library_dir, folder)
            if os.path.exists(path):
                shutil.rmtree(path)
                # Remove from reading progress if exists
                if folder in self.reading_progress:
                    del self.reading_progress[folder]
        
        # Save updated progress
        self.save_settings()
        
        self.dialog.dismiss()
        self.exit_selection_mode()
        self.refresh_library()

    def build(self):
        self.theme_cls.primary_palette = "Orange" 
        self.theme_cls.theme_style = "Dark"
        self.stop_event = threading.Event()
        self.engine = NovelEngine()
        self.title = "Novel DR"
        return Builder.load_string(KV)

    def get_settings_path(self):
        """Get the path to settings.json in the NovelLibrary folder"""
        return os.path.join(self.engine.library_dir, 'settings.json')

    def refresh_fetch_list(self):
        """Scans NovelLibrary, saves to JSON, and updates the UI list."""
        library_path = "NovelLibrary"
        if not os.path.exists(library_path):
            os.makedirs(library_path)
        
        # Get folders and sort them
        folders = [d for d in os.listdir(library_path) if os.path.isdir(os.path.join(library_path, d))]
        folders.sort()
        
        fetch_data = []
        display_text = ""
        
        for i, name in enumerate(folders, 1):
            # Count existing chapters (files starting with 'ch_')
            ch_path = os.path.join(library_path, name)
            ch_count = len([f for f in os.listdir(ch_path) if f.startswith('ch_')])
            
            fetch_data.append({"id": i, "name": name, "chapters": ch_count})
            display_text += f"{i}. {name.replace('_', ' ')} ({ch_count} Chs)\n"
        
        # Save to persistent JSON
        with open("fetch_list.json", "w") as f:
            json.dump(fetch_data, f)
        
        self.fetch_list_text = display_text if display_text else "No novels in library."

    # ----------------------------------------------------------------------
    # UPDATES SCREEN METHODS
    # ----------------------------------------------------------------------
    def refresh_update_novel_list(self):
        """Populates the readonly list in Updates screen with numbered entries."""
        list_box = self.root.ids.update_novel_list
        list_box.clear_widgets()

        cache_file = os.path.join(self.engine.library_dir, "fetch_cache.json")
        if not os.path.exists(cache_file):
            self.generate_fetch_cache()

        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                novels = json.load(f)
        except:
            novels = []

        for novel in novels:
            from kivymd.uix.label import MDLabel
            # Show number, title, and chapter count
            text = f"{novel['number']}. {novel['title']} - {novel['chapter_count']} Chapters"
            lbl = MDLabel(
                text=text,
                adaptive_height=True,
                theme_text_color="Secondary",
                font_style="Body",
                role="medium"
            )
            list_box.add_widget(lbl)

    def generate_fetch_cache(self):
        """Scans library and creates fetch_cache.json with accurate chapter counts."""
        cache_file = os.path.join(self.engine.library_dir, "fetch_cache.json")
        novels = self.engine.get_library()
        cache_data = []

        for index, novel in enumerate(novels, start=1):
            safe_title = novel.get('safe_title', '')
            novel_dir = os.path.join(self.engine.library_dir, safe_title)
            # Count .txt files that match ch_*.txt
            ch_count = 0
            if os.path.exists(novel_dir):
                ch_count = len([f for f in os.listdir(novel_dir)
                                if f.startswith('ch_') and f.endswith('.txt')])

            entry = {
                "number": index,
                "title": novel.get('title', 'Unknown'),
                "safe_title": safe_title,
                "url": novel.get('url', ''),
                "chapter_count": ch_count
            }
            cache_data.append(entry)

        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, indent=2)
        except Exception as e:
            print(f"Cache write error: {e}")

        self.refresh_update_novel_list()

    def start_novel_update(self):
        """Initiates update based on novel number entered by user."""
        number_text = self.root.ids.novel_number_input.text.strip()
        if not number_text.isdigit():
            self.show_snackbar("Please enter a valid novel number")
            return
        
        novel_number = int(number_text)
        
        # Load cache
        cache_file = os.path.join(self.engine.library_dir, "fetch_cache.json")
        if not os.path.exists(cache_file):
            self.generate_fetch_cache()
        
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                novels = json.load(f)
        except:
            self.show_snackbar("Could not load novel list")
            return
        
        # Find novel by number
        selected_novel = None
        for novel in novels:
            if novel.get('number') == novel_number:
                selected_novel = novel
                break
        
        if not selected_novel:
            self.show_snackbar(f"No novel found with number {novel_number}")
            return
        
        self.selected_novel_for_update = selected_novel
        
        # Get max chapters from input
        max_ch_text = self.root.ids.max_ch_update_input.text.strip()
        max_ch = int(max_ch_text) if max_ch_text.isdigit() else None

        # Setup progress bar
        self.total_chapters = max_ch
        self.chapters_completed = 0
        if max_ch is not None:
            self.update_bar_type = "determinate"
            self.update_progress = 0
        else:
            self.update_bar_type = "indeterminate"

        # Lock UI
        self.is_updating = True

        # UI preparations
        self.root.ids.update_progress_bar.opacity = 1
        self.root.ids.update_progress_bar.disabled = False
        self.root.ids.update_log_box.clear_widgets()

        self.update_start_time = datetime.now()
        self.update_timer_event = Clock.schedule_interval(self._update_timer_tick, 0.01)

        # Start update thread
        threading.Thread(target=self._run_update_thread, args=(max_ch,), daemon=True).start()

    def _update_timer_tick(self, dt):
        """Update timer label with elapsed time in MM:SS:mmm format."""
        elapsed = datetime.now() - self.update_start_time
        minutes = elapsed.seconds // 60
        seconds = elapsed.seconds % 60
        millis = elapsed.microseconds // 1000
        self.root.ids.update_timer.text = f"{minutes:03d}:{seconds:02d}:{millis:03d}"

    def _run_update_thread(self, max_ch):
        """Background thread for updating the novel."""
        novel = self.selected_novel_for_update
        url = novel['url']
        safe_title = novel['safe_title']
        start_ch = novel['chapter_count'] + 1   # next chapter to download

        def update_log(msg, tag="info"):
            # Map engine messages to desired format
            if "Downloading Chapter" in msg:
                ch_num = re.search(r'Chapter (\d+)', msg).group(1)
                display = f"[UPDATING] Chapter {ch_num}"
                color = "downloading"
            elif "Saved: Chapter" in msg:
                ch_num = re.search(r'Chapter (\d+)', msg).group(1)
                display = f"[DONE] Chapter {ch_num}"
                color = "success"
            elif "skipping..." in msg:
                ch_num = re.search(r'Chapter (\d+)', msg).group(1)
                display = f"[SKIPPED] Chapter {ch_num}"
                color = "info"
            else:
                display = msg
                color = tag

            # If a chapter was completed, increment progress if we have a total
            if ("DONE" in display or "SKIPPED" in display) and self.update_bar_type == "determinate" and self.total_chapters:
                self.chapters_completed += 1
                percent = (self.chapters_completed / self.total_chapters) * 100
                Clock.schedule_once(lambda dt: setattr(self, 'update_progress', min(percent, 100)))

            Clock.schedule_once(lambda dt: self._append_update_log(display, color))

        def prog(count, total):
            pass   # not used on updates screen – we rely on chapter completion

        self.engine.scrape_full_novel(
            start_url=url,
            log_cb=update_log,
            prog_cb=prog,
            stop_event=self.stop_event,
            start_ch=start_ch,
            max_ch=max_ch
        )

        Clock.schedule_once(self._finish_update)

    def _finish_update(self, dt):
        """Cleanup after update finishes, but hold for 3 seconds before resetting."""
        Clock.unschedule(self.update_timer_event)

        # If determinate, set bar to 100% (it may already be there)
        if self.update_bar_type == "determinate":
            self.update_progress = 100

        self._append_update_log("Update finished.", "success")

        # Wait 3 seconds, then hide bar and unlock UI
        Clock.schedule_once(self._reset_after_update, 3)

    def _reset_after_update(self, dt):
        self.update_progress = 0
        self.root.ids.update_progress_bar.opacity = 0
        self.root.ids.update_progress_bar.disabled = True
        self.generate_fetch_cache()                # refresh chapter counts
        self.refresh_update_novel_list()            # update readonly list
        self.is_updating = False

    def _append_update_log(self, text, color_tag="info"):
        """Add a formatted log line to the update activity box."""
        colors = {
            "info": [0.5, 0.5, 0.5, 1],        # gray
            "downloading": [0, 0.5, 1, 1],      # blue
            "success": [0, 0.5, 0, 1],          # green
            "error": [0.8, 0, 0, 1],            # red
        }
        from kivymd.uix.label import MDLabel
        lbl = MDLabel(
            text=text,
            theme_text_color="Custom",
            text_color=colors.get(color_tag, [1, 1, 1, 1]),
            adaptive_height=True,
            font_style="Body",
            role="small"
        )
        self.root.ids.update_log_box.add_widget(lbl)

    def clear_update_log(self):
        """Clear the activity log."""
        self.root.ids.update_log_box.clear_widgets()

    def truncate_title(self, title, max_len=25):
        """Truncate title to max_len and add ellipsis if needed."""
        if len(title) <= max_len:
            return title
        return title[:max_len] + "..."

    # ----------------------------------------------------------------------
    # END OF UPDATES METHODS
    # ----------------------------------------------------------------------

    def on_switch_tabs(self, bar, item, item_icon, item_label):
        """Refresh data when switching to Updates or Settings."""
        self.root.ids.inner_manager.current = item.name
        if item.name == "updates":
            self.generate_fetch_cache()
            self.refresh_update_novel_list()
        elif item.name == "settings":
            self.update_stats()

    def show_snackbar(self, text):
        MDSnackbar(
            MDSnackbarText(text=text),
            y="24dp",
            pos_hint={"center_x": .5},
            size_hint_x=.8,
        ).open()

    def load_settings(self):
        """Load settings from NovelLibrary/settings.json"""
        settings_path = self.get_settings_path()
        if os.path.exists(settings_path):
            try:
                with open(settings_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def save_settings(self):
        """Save settings to NovelLibrary/settings.json"""
        settings_path = self.get_settings_path()
        try:
            # Combine all settings into one dict
            settings = {
                'reading_progress': self.reading_progress,
                'theme': {'style': self.theme_cls.theme_style}
            }
            with open(settings_path, 'w', encoding='utf-8') as f:
                json.dump(settings, f, indent=2)
        except Exception as e:
            print(f"Failed to save settings: {e}")

    def on_start(self):
        # 1. Ensure we are on the splash screen
        Clock.schedule_once(lambda dt: self.loading_sequence(), 0.2)

        # Load settings from NovelLibrary folder
        settings = self.load_settings()
        
        # Load reading progress
        self.reading_progress = settings.get('reading_progress', {})
        
        # Load theme
        saved_theme = settings.get('theme', {}).get('style', 'Dark')
        self.change_theme(saved_theme)
        
        self.refresh_library()
        # Scan library immediately on startup
        self.refresh_fetch_list()
        self.update_stats()

    def loading_sequence(self):
        """Starts a simulated technical loading sequence."""
        # Niche technical-sounding messages
        self.sim_messages = [
            "Loading saved settings...",
            "Fetching reading progress...",
            "Loading saved themes...",
            "Refreshing Library...",
            "Loading Complete...",
            " "
        ]
        self.sim_index = 0
        self.run_sim_step()

    def run_sim_step(self, *args):
        """Recursively updates the status until the list is exhausted."""
        if self.sim_index < len(self.sim_messages):
            # Update the status text
            self.set_status(self.sim_messages[self.sim_index])
            self.sim_index += 1
            
            # Simulated speed: randomized between 0.1s and 0.4s for a 'real' feel
            import random
            delay = random.uniform(0.5, 3.)
            Clock.schedule_once(self.run_sim_step, delay)
        else:
            # Everything is 'loaded', switch to main view
            self.finish_splash()

    def set_status(self, text):
        self.splash_status_text = text
        # print(f"[SYSTEM] {text}") # Optional console logging

    def finish_splash(self, *args):
        # Refresh the actual data one last time before entering
        self.refresh_library()
        self.update_stats()
        
        # Switch screen
        if 'main_sm' in self.root.ids:
            self.root.ids.main_sm.current = "main_view"

    def _append_log(self, text, color_tag="info"):
        colors = {
            "info": [0, 0, 0, 1],  # Black for regular info
            "downloading": [0, 0.5, 1, 1],  # Blue for downloading
            "success": [0, 0.5, 0, 1],  # Dark Green for success
            "error": [0.5, 0, 0, 1]  # Dark Red for errors
        }
        ts = datetime.now().strftime('%H:%M')
        from kivymd.uix.label import MDLabel
        lbl = MDLabel(
            text=f"[{ts}] {text}",
            theme_text_color="Custom",
            text_color=colors.get(color_tag, [0, 0, 0, 1]),
            adaptive_height=True,
            font_style="Body",
            role="small"
        )
        self.root.ids.log_box.add_widget(lbl)

    def start_download(self, url, start_ch="1", max_ch=""): 
        if not url.strip():
            MDSnackbar(MDSnackbarText(text="Error: The URL field is empty!"), y="24dp", pos_hint={"center_x": .5}, size_hint_x=.8).open()
            return
        self.is_downloading = True
        self.stop_event.clear()
        threading.Thread(target=self._dl_thread, args=(url, start_ch, max_ch), daemon=True).start()

    def _dl_thread(self, url, start_ch, max_ch):
        def log(msg, tag="info"): 
            Clock.schedule_once(lambda dt: self._append_log(msg, tag))
        
        def prog(count, total):
            # We calculate progress relative to the absolute total 
            # to ensure it never exceeds 100%
            try:
                total_int = int(total)
                if total_int > 0:
                    percent = (count / total_int) * 100
                    Clock.schedule_once(lambda dt: setattr(self, 'prog_ch_val', min(percent, 100)))
            except:
                pass
            Clock.schedule_once(lambda dt: setattr(self, 'prog_ch_name', f"Chapter {count}"))

        self.engine.scrape_full_novel(url, log, prog, self.stop_event, start_ch, max_ch)
        success, count = self.engine.scrape_full_novel(url, log, prog, self.stop_event, start_ch, max_ch)
        
        def finalize(dt):
            self.is_downloading = False
            self.prog_ch_val = 0
            self.prog_ch_name = "Idle"
            self.refresh_library()
            self.update_stats()
        Clock.schedule_once(finalize)

    def clear_logs(self):
        self.root.ids.log_box.clear_widgets()

        
    def clear_inputs(self):
        """Resets the URL and Max Chapters text fields and fixes layout glitches."""
        self.root.ids.url_input.text = ""
        self.root.ids.start_ch_input.text = ""
        self.root.ids.max_ch_input.text = ""
        
        self.root.ids.url_input.focus = True
        self.root.ids.url_input.focus = False
        self.root.ids.start_ch_input.focus = True
        self.root.ids.start_ch_input.focus = False
        self.root.ids.max_ch_input.focus = True
        self.root.ids.max_ch_input.focus = False

    def change_theme(self, theme_name):
        if theme_name == "Dark":
            self.theme_cls.theme_style = "Dark"
            c, f = [0.06, 0.06, 0.06, 1], [1, 1, 1, 1]
        elif theme_name == "Light":
            self.theme_cls.theme_style = "Light"
            c, f = [1, 1, 1, 1], [0, 0, 0, 1]
        elif theme_name == "Sepia":
            self.theme_cls.theme_style = "Light"
            c, f = [0.96, 0.91, 0.82, 1], [0.26, 0.19, 0.13, 1]

        self.bg_color = self.reader_bg = c
        self.reader_fg = f
        
        # Save theme setting
        self.save_settings()

    def update_stats(self):
        lib = self.engine.get_library()
        self.stats = {"novels": len(lib), "chapters": sum(len(n.get('chapters', [])) for n in lib)}

    def toggle_summary(self):
        """Toggle between truncated and full summary"""
        self.summary_expanded = not self.summary_expanded
        
        summary_label = self.root.ids.summary_label
        see_more_btn = self.root.ids.see_more_btn_text
        
        if self.summary_expanded:
            # Show full summary
            summary_label.text = self.full_summary
            summary_label.max_lines = 0
            see_more_btn.text = "See Less"
        else:
            # Show first paragraph
            summary_label.text = self.get_first_paragraph(self.full_summary)
            summary_label.max_lines = 0
            see_more_btn.text = "See More"

    def get_first_paragraph(self, text):
        """Extract the first paragraph from the summary, handling various formats"""
        if not text:
            return "No summary available."
        
        # Try different paragraph separators in order of priority
        separators = ['\n\n', '\n', '. ']
        
        for separator in separators:
            parts = text.split(separator)
            if len(parts) > 1:
                # Found a paragraph break
                first_para = parts[0]
                
                # Add appropriate ellipsis based on separator
                if separator == '\n\n':
                    return first_para + "\n\n..."
                elif separator == '\n':
                    return first_para + "\n..."
                else:  # '. ' - sentence break
                    return first_para + "..."
        
        # If no paragraph breaks found, return the whole text
        return text

    def get_summary_stats(self, text):
        """Helper method to get summary statistics"""
        paragraphs = text.split('\n\n')
        sentences = re.split(r'[.!?]+', text)
        words = text.split()
        
        return {
            'paragraphs': len([p for p in paragraphs if p.strip()]),
            'sentences': len([s for s in sentences if s.strip()]),
            'words': len(words),
            'characters': len(text)
        }

    def continue_reading(self):
        """Continue reading from last position"""
        if not hasattr(self, 'current_novel'):
            return
        
        safe_title = self.current_novel['safe_title']
        if safe_title in self.reading_progress:
            index = self.reading_progress[safe_title]['chapter_index']
            self.read_chapter(index)

    def read_chapter(self, index):
        """Read a specific chapter and update progress"""
        ch = self.current_novel['chapters'][index]
        path = os.path.join(self.engine.library_dir, self.current_novel['safe_title'], ch['filename'])
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                self.current_content = f.read()
                self.current_ch_title = ch['title']
            
            # Update reading progress
            safe_title = self.current_novel['safe_title']
            self.reading_progress[safe_title] = {
                'chapter_index': index,
                'chapter_title': ch['title']
            }
            
            # Save progress to storage
            self.save_settings()
            
            # Go to reader screen
            self.root.ids.main_sm.current = "reader"
            
        except Exception as e:
            MDSnackbar(MDSnackbarText(text=f"Load Error: {str(e)[:30]}")).open()
    
    def change_chapter(self, direction):
        """Moves to the next or previous chapter based on direction (1 or -1)"""
        if not hasattr(self, 'current_novel'):
            return
            
        safe_title = self.current_novel['safe_title']
        if safe_title not in self.reading_progress:
            return

        current_index = self.reading_progress[safe_title]['chapter_index']
        new_index = current_index + direction
        
        # Check if the new index is within the chapter list range
        if 0 <= new_index < len(self.current_novel['chapters']):
            self.read_chapter(new_index)
            
            # Reset scroll position to top
            reader_screen = self.root.ids.main_sm.get_screen('reader')
            # Find the ScrollView in the reader screen and set scroll_y to 1 (top)
            for child in reader_screen.children[0].children:
                if isinstance(child, ScrollView):
                    child.scroll_y = 1
                    break
        else:
            msg = "First chapter reached" if direction == -1 else "Last chapter reached"
            MDSnackbar(MDSnackbarText(text=msg)).open()  

    def refresh_library(self):
        """Refresh the library grid"""
        # Renamed ID reference from grid to list
        grid = self.root.ids.library_list
        grid.clear_widgets()
        
        # Get the empty message widget
        empty_msg = self.root.ids.empty_library_msg
        
        # Reload progress from settings to ensure it's up to date
        settings = self.load_settings()
        self.reading_progress = settings.get('reading_progress', {})
        
        novels = self.engine.get_library()
        
        if len(novels) == 0:
            # Show empty library message
            empty_msg.opacity = 1
            empty_msg.disabled = False
        else:
            # Hide empty library message
            empty_msg.opacity = 0
            empty_msg.disabled = True
            
            # Add novel cards
            for novel in novels:
                card = NovelCard(title=novel['title'], novel_data=novel)
                if novel['safe_title'] in self.reading_progress:
                    # Optionally add a visual indicator on the card
                    pass
                grid.add_widget(card)

    def open_novel(self, novel):
        """Populates the Chapters screen with scraped metadata."""
        self.current_novel = novel
        self.current_novel_title = novel.get('title', "Novel Details")
        self.root.ids.main_sm.current = "chapters"
        
        # Reset summary state
        self.summary_expanded = False
        
        # Update the UI Labels
        self.root.ids.novel_title_label.text = novel.get('title', "Unknown Title")
        self.root.ids.author_label.text = novel.get('author', 'Unknown')
        
        # Get the full summary
        full_summary = novel.get('synopsis', "No summary available.")
        
        # Store full summary for later use
        self.full_summary = full_summary
        
        # Get first paragraph for truncated view
        summary_label = self.root.ids.summary_label
        truncated = self.get_first_paragraph(full_summary)
        
        # Set the truncated text (don't use max_lines)
        summary_label.text = truncated
        summary_label.max_lines = 0  # No line limits since we manually truncated
        self.root.ids.see_more_btn_text.text = "See More"
        
        # Update reading progress UI
        self.update_reading_ui()
        
        btn_container = self.root.ids.chapter_button_grid
        btn_container.clear_widgets()
        
        for i, ch in enumerate(novel.get('chapters', [])):
            from kivymd.uix.label import MDLabel
            
            # Check if this chapter is the current reading position
            safe_title = novel['safe_title']
            is_current = False
            if safe_title in self.reading_progress:
                is_current = (i == self.reading_progress[safe_title]['chapter_index'])
            
            # Create card with different style for current chapter
            chapter_card = MDCard(
                style="outlined",
                padding="12dp",
                size_hint_y=None,
                height="60dp",
                ripple_behavior=True,
                md_bg_color=[0.2, 0.6, 1, 0.1] if is_current else self.theme_cls.surfaceColor,
                line_color=[0.2, 0.6, 1, 1] if is_current else [0, 0, 0, 0],
                on_release=lambda x, idx=i: self.read_chapter(idx)
            )
            
            # Add chapter title
            title_label = MDLabel(
                text=ch['title'],
                theme_text_color="Secondary",
                adaptive_height=True,
                font_style="Body",
                role="large"
            )
            
            # Add "Current" indicator if this is the current chapter
            if is_current:
                title_label.text = ">>> " + ch['title']
            
            chapter_card.add_widget(title_label)
            
            btn_container.add_widget(chapter_card)

    def update_reading_ui(self):
        """Update the reading progress card with current novel data."""
        if not hasattr(self, 'current_novel'):
            return

        safe_title = self.current_novel['safe_title']
        chapters = self.current_novel.get('chapters', [])
        total = len(chapters)

        # Get references to the new widgets
        progress_label = self.root.ids.progress_chapters_label
        progress_bar = self.root.ids.progress_bar
        last_read_label = self.root.ids.last_read_label
        continue_btn = self.root.ids.continue_reading_btn

        # Set chapters count
        progress_label.text = f"Chapters: 0/{total}"
        progress_bar.value = 0
        last_read_label.text = "Last Read: None"
        continue_btn.disabled = True
        continue_btn.opacity = 0.5  # visually indicate it's disabled

        if safe_title in self.reading_progress:
            progress = self.reading_progress[safe_title]
            current_index = progress['chapter_index']
            current_title = progress['chapter_title']

            # Update chapters count and progress bar
            progress_label.text = f"Chapters: {current_index + 1}/{total}"
            progress_bar.value = (current_index + 1) / total * 100

            # Update last read and enable continue button
            last_read_label.text = f"Last Read: {current_title}"
            continue_btn.disabled = False
            continue_btn.opacity = 1
            continue_btn.children[0].text = "Continue"  # ensure correct text
        else:
            # No progress – keep the default "None" values
            pass

    def go_back(self):
        """Handle back navigation"""
        sm = self.root.ids.main_sm
        if sm.current == "reader":
            # When coming back from reader, refresh the chapters screen to update UI
            sm.current = "chapters"
            if hasattr(self, 'current_novel'):
                self.update_reading_ui()
                self.open_novel(self.current_novel)  # Refresh the chapter list
        else:
            sm.current = "main_view"

    def on_stop(self):
        """Called when the app is closing. Signal the download thread and force exit."""
        self.stop_event.set()          # tell the download loop to stop
        # Give the thread a moment to finish its current request
        import time
        time.sleep(0.5)
        # Force the application to exit immediately
        import os
        os._exit(0)


if __name__ == "__main__":
    Window.size = (380, 720)
    NovelApp().run()
