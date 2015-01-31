var geocoder = new google.maps.Geocoder(),
    map,
    marker,
    featureGroup,
    representativeTemplate = _.template( // @todo Replace this one underscore dependency.
      '<div class="col-xs-6 col-sm-4 col-md-2 representative">' +
        '<div class="avatar" style="background-image: url(<% if (photo_url) { %><%= photo_url %><% } else { %>/static/img/silhouette.png<% } %>)"></div> ' +
        '<p><% if (party_name) { %><%= party_name %><% } %> ' + '<%= elected_office %> ' +
        '<strong><% if (url) { %><a href="<%= url %>"><%= name %></a><% } else { %><%= name %><% } %></strong></p> ' +
        '<p class="district-name"><%= district_name %> <button type="button" class="btn btn-default btn-xs shape" data-url="<%= related.boundary_url %>">' + gettext('Map') + '</button></p> ' +
        '<p><% if (email) { %><a href="mailto:<%= email %>">' + gettext('Email') + ' <%= first_name %></a><% } %></p> ' +
      '</div>'
    );

/**
 * @see https://learn.jquery.com/code-organization/deferreds/examples/
 */
function createCache(url) {
  var cache = {};
  return function (arg) {
    var key = arg.toString();
    if (!cache[key]) {
      cache[key] = $.ajax({dataType: 'json', url: url(arg)});
    }
    return cache[key];
  };
}

/**
 * @param L.LatLng latlng
 */
var getRepresentativesByLatLng = createCache(function (latlng) {
  return '/representatives/?limit=0&point=' + latlng.lat + ',' + latlng.lng;
});

/**
 * @param string path the boundary's path
 */
var getBoundaryShape = createCache(function (path) {
  return path + 'simple_shape';
});

/**
 * @param L.LatLng latlng
 */
function processLatLng(latlng) {
  featureGroup.clearLayers();
  $('#map').css('visibility', 'visible');

  marker.setLatLng(latlng);
  map.panTo(latlng);

  getRepresentativesByLatLng(latlng).then(function (response) {
    var representatives = [],
        $representatives = $('<div id="representatives"></div>'),
        $row;

    for (var i = response.objects.length; i--;) {
      if (response.objects[i]['elected_office'] == 'MP') {
        representatives.push(response.objects[i]);
        response.objects.splice(i, 1);
      }
    }
    for (var i = response.objects.length; i--;) {
      if ('MHA|MLA|MNA|MPP'.indexOf(response.objects[i]['elected_office']) >= 0) {
        representatives.push(response.objects[i]);
        response.objects.splice(i, 1);
      }
    }
    for (var i = response.objects.length; i--;) {
      if (response.objects[i]['elected_office'] == 'Mayor') {
        representatives.push(response.objects[i]);
        response.objects.splice(i, 1);
      }
    }

    representatives = representatives.concat(response.objects);

    $.each(representatives, function (i, object) {
      if (i % 6 == 0) {
        $row = $('<div class="row"></div>');
        $representatives.append($row);
      }
      else if (i % 3 == 0) {
        $row.append('<div class="clearfix visible-sm"></div>')
      }
      else if (i % 2 == 0) {
        $row.append('<div class="clearfix visible-xs"></div>')
      }
      var $representative = $(representativeTemplate(object));
      $row.append($representative);
    });

    $('#representatives').replaceWith($representatives);

    $('#representatives').imagesLoaded().progress(function (instance, image) {
      if (!image.isLoaded) {
        $(image.img).attr('src', '/static/img/silhouette.png');
      }
    });
  });
}

function processAddress() {
  $('.alert').hide();
  $('#addresses').empty();

  geocoder.geocode({address: $('#address').val(), region: 'ca', language: gettext('en')}, function (results, status) {
    if (status == google.maps.GeocoderStatus.OK) {
      if (results.length > 1) {
          $('#addresses').append('<option>' + gettext('Select your address') + '</option>');
        $.each(results, function (i, result) {
          $('#addresses').append('<option data-latitude="' + result.geometry.location.lat() + '" data-longitude="' + result.geometry.location.lng() + '">' + result.formatted_address + '</option>');
        });
        $('#many-results').fadeIn('slow');
      }
      else {
        processLatLng(L.latLng(results[0].geometry.location.lat(), results[0].geometry.location.lng()));
      }
    }
    else if (status == google.maps.GeocoderStatus.ZERO_RESULTS) {
      $('#no-results').fadeIn('slow');
    }
    else {
      $('#unknown-error').fadeIn('slow');
    }
  });
}

$(function ($) {
  var latlng = L.latLng(45.444369, -75.693832), // 24 Sussex Drive, Ottawa
      index = window.location.href.indexOf('#'),
      anchor;

  // Create the map, marker and feature group.
  map = L.map('map', {
    attributionControl: false,
    center: latlng,
    layers: [
      L.tileLayer('https://{s}.tiles.mapbox.com/v3/jpmckinney.hlcgg444/{z}/{x}/{y}.png')
    ],
    maxZoom: 17,
    zoom: 13,
    scrollWheelZoom: false
  });
  marker = L.marker(latlng, {draggable: true});
  featureGroup = L.featureGroup();
  map.addLayer(marker);
  map.addLayer(featureGroup);

  // Moving the marker calls the API.
  marker.on('dragend', function () {
    $('.alert').hide();
    processLatLng(marker.getLatLng());
  });

  // Geolocation calls the API.
  map.on('locationfound', function (event) {
    $('.alert').hide();
    processLatLng(event.latlng);
  });

  // Call the API if the user submits an address.
  $('#submit').click(function (event) {
    processAddress();
    event.preventDefault();
  });

  // Call the API if the user selects on an address.
  $('#addresses').change(function (event) {
    var $this = $(this).find(':selected');
    processLatLng(L.latLng($this.data('latitude'), $this.data('longitude')));
    event.preventDefault();
  });

  // Display a boundary if user clicks on a boundary name.
  $(document).on('click', '.shape', function (event) {
    featureGroup.clearLayers();
    $.scrollTo('#map', {axis: 'y', duration: 600, easing: 'easeOutQuart', offset: -40});

    getBoundaryShape($(this).data('url')).then(function (response) {
      featureGroup.addLayer(L.geoJson(response));
      map.fitBounds(featureGroup.getBounds());
    });

    event.preventDefault();
  });

  // Perform the first geolocation.
  if (index !== -1) { // Backwards-compatibility.
    anchor = window.location.href.substr(index + 1);
  }
  if (anchor) {
    $('#address').val(unescape(anchor));
    processAddress();
  }
  else {
    map.locate({setView: true, maxZoom: 13});
  }
});
