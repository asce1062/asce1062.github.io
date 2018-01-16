function gid(e) {
    return document.getElementById(e);
}

function ev(el, e, f) {
    return el.addEventListener(e, f);
}

var player = gid("audio");
var source = gid("source");

function setSrc(src) {
    if (source.src != src) {
        source.src = src;
        audio.load();

        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
        return;
    }

    if (audio.paused) {
        audio.play();
    } else {
        audio.pause();
    }
}

ev(audio, "timeupdate", function() {
    var width = $(".playing").width();
    $(".playing").css({ "box-shadow": "inset " + ((width / audio.duration) * audio.currentTime) + "px 0 #C28754" });
});

$(".track").click(function() {
    $(".playing").css({ "box-shadow": "inset 2px 2px white, inset -2px -2px white, inset 2px -2px white, inset -2px 2px white, inset" });
    $(".playing").addClass("default");
    $(".playing").removeClass("playing");
    $(this).addClass("playing");
    $(this).addClass("default");
});