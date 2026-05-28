from flask import Flask, send_file, send_from_directory

app = Flask(__name__)


@app.route("/")
def index():
    return send_file("index.html")


@app.route("/background_images/<path:filename>")
def serve_background_images(filename):
    return send_from_directory("background_images", filename)


@app.route("/animals/<path:filename>")
def serve_animals(filename):
    return send_from_directory("animals", filename)


@app.route("/audios/<path:filename>")
def serve_audios(filename):
    return send_from_directory("audios", filename)


@app.route("/background_music/<path:filename>")
def serve_background_music(filename):
    return send_from_directory("background_music", filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
