const SearchEngine = {
  floors: [],

  init() {
    this.bindSearchInput();
    this.bindPlaceDetailsClose();
  },

  bindSearchInput() {
    const searchBar = $('#search-bar');
    const suggestionList = $('.suggestion-list');

    $('.bg-map').on("click scroll", () => {
      suggestionList.hide();
    });

    searchBar.on("focus", () => {
      if (searchBar.val().trim() !== "") {
        suggestionList.show();
      }
    });

    searchBar.on("input", async () => {
      const val = searchBar.val().trim();
      if (!val) {
        suggestionList.hide().empty();
        return;
      }

      const results = await API.search(val);
      suggestionList.empty().show();

      if (results.length === 0) {
        suggestionList.html("<li>No results found</li>");
      } else {
        results.forEach(building => {
          const li = $(`
            <li>
              <div class="match">${building.match}</div>
              <div class="building-place">${building.floor}, ${building.name}</div>
            </li>
          `);
          li.click(() => this.gotoPlace(building.id));
          suggestionList.append(li);
        });
      }
    });

    $('#search-icon-btn').click(() => {
      searchBar.trigger('input');
    });
  },

  async gotoPlace(id) {
    $('.suggestion-list').hide();
    await MapEngine.setZoom(4);

    const loc = await API.getLocation(id);
    if (loc && loc.left && loc.top) {
      const topPx = parseInt(loc.top);
      const leftPx = parseInt(loc.left);

      const bgMap = document.querySelector('.bg-map');
      bgMap.scrollTop = topPx - window.innerHeight / 2 + 150;
      bgMap.scrollLeft = leftPx - window.innerWidth / 2;

      const pin = $('#pin');
      pin.css({
        "left": `${leftPx - 16}px`,
        "top": `${topPx - 36}px`,
      }).show();

      setTimeout(() => this.openPlaceDetails(id), 600);
    }
  },

  async openPlaceDetails(id) {
    $('.place-details').css({
      "visibility": "visible",
      "height": "40vh"
    });
    $('.get-down-btn').css({
      "visibility": "visible",
      "bottom": "42vh"
    });
    $('.layer-button, .zoom-buttons').css({
      "bottom": "42vh"
    });

    const result = await API.getDetails(id, MapEngine.zoomLevel);
    this.renderPlaceDetails(result);
  },

  renderPlaceDetails(result) {
    $('.place-title').text(result.name || '');
    $('.place-main').text(result.main || '');
    this.floors = result.floors || [];

    const floorContainer = $('.floors')[0];
    const classContainers = $('.classes');

    floorContainer.innerHTML = `<div class="underline"></div>`;
    classContainers.empty().removeClass('visible');

    this.floors.forEach((floor, idx) => {
      const floorBtn = $(`<div class="floor ${idx === 0 ? 'active' : ''}">${floor.name}</div>`);
      floorBtn.click(() => this.slideFloor(idx));
      $(floorContainer).append(floorBtn);
    });

    this.floors.forEach((floor, idx) => {
      if (idx < classContainers.length) {
        (floor.rooms || []).forEach(room => {
          classContainers[idx].innerHTML += `<li>${room}</li>`;
        });
      }
    });

    if (classContainers.length > 0) {
      classContainers[0].classList.add('visible');
    }
  },

  slideFloor(idx) {
    $('.underline').css("transform", `translateX(${idx * 100}px)`);
    $('.floors')[0].scrollLeft = idx * 100;
    $('.classes.visible').removeClass('visible');
    $('.floor.active').removeClass('active');

    const classContainers = $('.classes');
    if (classContainers[idx]) {
      classContainers[idx].classList.add('visible');
    }
    $('.floor').eq(idx).addClass('active');
  },

  bindPlaceDetailsClose() {
    $('#btn-hide-details').click(() => {
      this.closePlaceDetails();
    });
  },

  closePlaceDetails() {
    $('.place-details').css({
      "visibility": "hidden",
      "height": "0px"
    });
    $('.get-down-btn').css({
      "visibility": "hidden",
      "bottom": "0px"
    });
    $('.layer-button, .zoom-buttons').css({
      "bottom": "40px"
    });
    $('.classes.visible').removeClass('visible');
    $('.floor.active').removeClass('active');
    $('#pin').hide();
    $('.place-title').empty();
    $('.place-main').empty();
    $('.floors').html('<div class="underline"></div>');
    $('.classes').empty();
  }
};
