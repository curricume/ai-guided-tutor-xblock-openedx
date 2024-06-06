/* Javascript for GuidedRubricXBlock. */
function GuidedRubricXBlock(runtime, element) {

    let chatMsg = document.getElementById('chat-msg');
    let chatLogs = document.getElementById('chat-logs');
    let sendBtn = document.getElementById('send-btn');
    let skipBtn = document.getElementById('skip-btn');
    let errorMsg = document.getElementById('error-msg');

    // loader
    let loadingMsg = document.createElement('div');
    var overlay = document.createElement("div");
    var loader = document.createElement("div");
    overlay.setAttribute("class", "overlay");
    overlay.setAttribute("id", "overlay-loader");
    loader.setAttribute("class", "lds-dual-ring");
    overlay.appendChild(loader);
    loadingMsg.classList.add("loading");
    loadingMsg.appendChild(loader);

    // Handlers
    var handlerUrl = runtime.handlerUrl(element, 'send_message');

    function send_message(message) {
        return $.ajax({
            type: "POST",
            url: handlerUrl,
            data: JSON.stringify({"message": message}),
            contentType:"application/json; charset=utf-8",
            dataType: "json",
        }).done(function(response) {
            if (response.result === 'success') {
                if (response.response[1]){
                    var statusElements = document.getElementsByClassName('status');
                    statusElements[statusElements.length - 1].textContent = "Status: " + response.response[1];
                }
                chatLogs.removeChild(loadingMsg);
                type_message(response.response);
            } else {
                alert("You've reached the end of the exercise. Hope you learned something!");
                chatLogs.removeChild(loadingMsg);
                document.querySelector('.chat-input').style.display = 'block';
            }
        }).fail(function(error) {
            console.log("An error occurred: ", error);
        });
    };
    sendBtn.addEventListener('click', function() {
        let status = document.createElement('div');
        if (!chatMsg.value.trim()) {
            errorMsg.textContent = "You should enter response";
            return;
        }
        document.querySelector('.chat-input').style.display = 'none';
        errorMsg.textContent = "";
        let newMsg = document.createElement('div');
        newMsg.textContent = "Your Answer: " + chatMsg.value;
        newMsg.classList.add("my-msg");
        status.classList.add("status");
        status.textContent = "Status: Pending";
        chatLogs.appendChild(newMsg);
        chatLogs.appendChild(status)
        chatLogs.appendChild(loadingMsg);

        chatMsg.value = "";
        send_message(newMsg.textContent);
    });
    skipBtn.addEventListener('click', function() {
        var status = document.createElement('div');
        document.querySelector('.chat-input').style.display = 'none';
        errorMsg.textContent = "";
        let newMsg = document.createElement('div');
        newMsg.textContent = "Your Answer: " + chatMsg.value;
        status.textContent = "Status: Skip";
        newMsg.classList.add("my-msg");
        chatLogs.appendChild(newMsg);
        chatLogs.appendChild(status)
        chatLogs.appendChild(loadingMsg);
        chatMsg.value = "";
        send_message("skip");
    });

    function type_message(data) {
        chunks = data[3]
        let aiMsg = document.createElement('div');
        let question = document.createElement('p');
        question.classList.add("questions");
        aiMsg.classList.add("ai-msg");
        chatLogs.appendChild(aiMsg);
    
        // This function will be called recursively with a delay to simulate streaming
        function displayNextChunk(index) {
            if (index < chunks.length) {
                // Append the current chunk to the aiMsg element
                aiMsg.textContent += chunks[index];
                
                // Call this function again for the next chunk after a short delay
                setTimeout(() => displayNextChunk(index + 1), 100); // Adjust delay as needed
            } else {
                // Once all chunks are displayed, make the input field visible again
                if (data[2]){
                    question.textContent = data[2];
                    chatLogs.appendChild(question);
                }
                if (data[2] === null) {
                    allQuestions = document.querySelectorAll('.my-msg');
                    lastQuestion = allQuestions[allQuestions.length - 1];
                    lastQuestion.parentNode.removeChild(lastQuestion);
                }
                document.querySelector('.chat-input').style.display = 'block';
            }
        }
    
        // Start displaying chunks from the first one
        displayNextChunk(0);
    }
    $(function ($) {
        /* Here's where you'd do things on page load. */
    });

}
