/* Javascript for GuidedRubricXBlock. */
function GuidedRubricXBlock(runtime, element) {

    let sendBtn = document.getElementById('send-btn');
    let skipBtn = document.getElementById('skip-btn');
    let resetBtn = document.getElementById('reset-responses-button');

    var attempted_phase_is_last = null;
    var is_attempted_phase_successful = null;

    // Handlers
    var handlerUrl = runtime.handlerUrl(element, 'send_message');
    var resetHandlerUrl = runtime.handlerUrl(element, 'reset_user_responses');

    function is_excercise_finished()
    {
        if (attempted_phase_is_last == true && is_attempted_phase_successful == true)
        {
            return true;
        }

        else 
        {
            return false;
        }

    }

    function IncreaseTextAreaHeight() {
        // Select all text areas with the class 'chat-msg'
        const textareas = document.querySelectorAll('.chat-msg');
        // Loop through each text area and add event listeners
        textareas.forEach(textarea => {
            // Add a focus event listener to each text area
            textarea.addEventListener('input', function() {
                // Reset the height to auto to calculate the correct scrollHeight
                this.style.height = 'auto';
                // Set the height to the scrollHeight of the text area
                this.style.height = (this.scrollHeight) + 'px';
            });
            // Initialize the textarea height
            textarea.style.height = textarea.scrollHeight + 'px';
        });
    }

    function send_message(message) {
        const completion_token = parseInt(document.getElementById('completion_token').value);
        const max_tokens_per_user = parseInt(document.getElementById('max_tokens_per_user').value);
        const is_staff = document.getElementById('is_staff').value === 'True';

        if(completion_token >= max_tokens_per_user && !is_staff){
            alert("You have exceeded the allowed number of tokens. Please contact the course staff")
        }
        else{

        if (is_excercise_finished() == true)
        {
            alert('You have reached to the end of excercise')
            return
        }
        let aiMsgs = document.querySelectorAll('.ai-msg');
        let aiMsg = aiMsgs[aiMsgs.length - 1];
        let loaders = document.querySelectorAll('.lds-dual-ring');
        let loader = loaders[loaders.length - 1];
        loader.style.display = 'block';
        return $.ajax({
            type: "POST",
            url: handlerUrl,
            data: JSON.stringify({"message": message}),
            contentType:"application/json; charset=utf-8",
            dataType: "json",
        }).done(function(response) {
            loader.style.display = 'none';
            aiMsg.style.setProperty('display', 'flex', 'important');
            if (response.result === 'success') {
                if (response.response[1] == "Success" && response.response[2]) {
                    type_message(response.response);
                    keep_user_response(message, $('#last_attempted_phase_id'), response.response[0], response.response[2])
                    IncreaseTextAreaHeight()
                } 
                else if (message == "skip" && response.response[2]) {
                    keep_user_response(message, $('#last_attempted_phase_id'), response.response[0], response.response[2])
                    IncreaseTextAreaHeight()
                } else if (message == "skip" && response.response[2] == null) {
                    $('.micro-ai-btn-container').css('display', 'none');
                    let p = document.createElement('p');
                    p.classList.add('notification-btm');
                    p.textContent = response.response[5];
                    document.querySelectorAll('.chatgpt_wrapper')[document.querySelectorAll('.chatgpt_wrapper').length - 1].appendChild(p);
                } else {
                    type_message(response.response);
                }
                let completion_token = response.response_metadata.completion_token
                $('#completion_token').val(completion_token)
                attempted_phase_is_last = response.response_metadata['attempted_phase_is_last']
                is_attempted_phase_successful = response.response_metadata['is_attempted_phase_successful']
            } else {
                // alert("You've reached the end of the exercise. Hope you learned something!");
                document.querySelector('.chat-input').style.display = 'block';
            }
        }).fail(function(error) {
            console.log("An error occurred: ", error);
        });
    }};

    if (sendBtn != null)
    {
        sendBtn.addEventListener('click', function() {
            let chatMsgs = document.querySelectorAll('.chat-msg');
            let lastChatMsg = chatMsgs[chatMsgs.length - 1];

            if (!lastChatMsg.value.trim()) {
                alert("You should enter prompt")
                return;
            }
            var chat_message = lastChatMsg.value;
            last_attempted_phase_id = $('#last_attempted_phase_id').val()
            $('.micro-ai-btn-container').css('display', 'none');
            $('#reset-responses-button').css('display', 'none');
            var Notificationelements = document.querySelectorAll('.notification-btm');
            Notificationelements.forEach(function(element) {
                element.parentNode.removeChild(element);
            });
            send_message(chat_message);
        });
    }
    if (skipBtn != null)
    {
        skipBtn.addEventListener('click', function() {
            let chatMsgs = document.querySelectorAll('.chat-msg');
            let aiMsgs = document.querySelectorAll('.ai-msg');
            let lastChatMsg = chatMsgs[chatMsgs.length - 1];
            let aiMsg = aiMsgs[aiMsgs.length - 1].querySelector('p');
            lastChatMsg.value = "skip";
            aiMsg.textContent = "None";
            send_message("skip");
        });
    }

    function reset_user_responses() {
        if (confirm("Do you want to reset the responses?")) {
            const completion_token = parseInt(document.getElementById('completion_token').value);
            const max_tokens_per_user = parseInt(document.getElementById('max_tokens_per_user').value);
            const is_staff = document.getElementById('is_staff').value === 'True';
            if (!is_staff && completion_token >= max_tokens_per_user) {
                alert("You cannot reset responses because you have exceeded the maximum number of tokens.");
                return;
            }
            $.ajax({
                type: "POST",
                url: resetHandlerUrl,
                data: JSON.stringify({}),
                contentType: "application/json",
                success: function (result) {
                    alert("Responses have been reset. Refresh the page for a better UI experience.");
                    location.reload();
                },
                error: function (error) {
                    console.error("Error resetting responses:", error);
                    alert("An error occurred while resetting responses.");
                }
            });
        }
    }

    if (resetBtn != null) {
        resetBtn.addEventListener('click', reset_user_responses);
    }

    function keep_user_response(user_input, phase_id, ai_response, attempted_phase_question)
    {
        $('.recent-ai-msg').removeClass('recent-ai-msg');
        var user_response_div = `<div id="chat-logs">
        <p class="questions">`+attempted_phase_question+`</p>
            </div>

        <div class="chat-input" style="display: block;" id="prompt-with-loader">
            <div id ="chat_input_loader" class="lds-dual-ring" style="display:none"></div><span id="error-msg"></span>
            <textarea id="chat-msg" class="chat-msg" placeholder="Enter Prompt ... " rows="1" cols="3"></textarea>
        </div>
        <div id="ai-msg" class="ai-msg recent-ai-msg"><div class="icon-bar">
            🤖
        </div><p></p></div>`
        $('#chatbox-history').append(user_response_div);

    }

    // Student reports
    var reportElement = $(element).find(".scorm-reports .report");
    function initReports() {
        if (reportElement.length === 0){
            return;
        }
        $(element).find("button.clear-data").on("click", function () {
            viewReports();
        });
        $(element).find("button.clear-data").on("click", function () {
            reloadReport();
        });

        $.ui.autocomplete(
            {
                source: searchStudents,
                select: setStudentId,
            }, $(element).find(".scorm-reports input.search-students")
        );
    }

    function searchStudents(request, response) {
        var url = runtime.handlerUrl(element, 'scorm_search_students');
        $.ajax({
            url: url,
            data: {
                'id': request.term
            },
        }).success(function (data) {
            if (data.length === 0) {
                noStudentFound()
            }
            else if(data.length > 0){
                StudentFound()
            }
            response(data);
        }).fail(function () {
            noStudentFound()
            response([])
        });
    }

    function noStudentFound() {
        reportElement.html("no student found");
        $(element).find(".reload-report").addClass("reports-togglable-off");
    }

    function StudentFound() {
        reportElement.html("Student found");
        $(element).find(".reload-report").addClass("reports-togglable-off");
    }

    function viewReports() {
        // Display reports on button click
        $(element).find(".reports-togglable").toggleClass("reports-togglable-off");
    }

    var studentId = null;
    function viewReport(event, ui) {
        studentId = ui.item.data.student_id;
        getReport(studentId);
    }

    function setStudentId(event, ui){
        studentId = ui.item.data.student_id;
    }

    function reloadReport() {
        getReport(studentId)
    }

    function getReport(studentId) {
        if(studentId === null){
            alert("Please enter the username/email before clearing");
            return;
        }
        var getReportUrl = runtime.handlerUrl(element, 'scorm_get_student_state');
        $.ajax({
            url: getReportUrl,
            data: {
                'id': studentId,
                'block_id': $('#block_id').val()
            },
        }).success(function (response) {
            let completion_token = response.response_metadata.completion_token;
            $('#completion_token').val(completion_token);
            location.reload();
            reportElement.html("Cleared user data");
        }).fail(function () {
        }).complete(function () {
            $(element).find(".reload-report").removeClass("reports-togglable-off");
        });
        
    }

    function type_message(data) {
        var pElements = document.querySelectorAll('.ai-msg p');
        let pElement = pElements[pElements.length - 1];
    
        pElement.innerHTML = '';  // Use innerHTML to preserve HTML formatting
        let text = data[0];       // Get the input text
    
        // Function to preprocess text and replace markers with HTML tags
        function preprocessText(text) {
            return text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Replace **text** with <strong>text</strong>
                .replace(/\n/g, '<br>') // Replace newlines with <br>
                .replace(/`/g, '');
        }

        // Preprocess the text
        let processedText = preprocessText(text);
    
        // Function to simulate streaming by displaying text chunk by chunk
        function displayNextChunk(index, processedText) {
            if (index < processedText.length) {
                // Append the current chunk to the aiMsg element
                pElement.innerHTML = processedText.slice(0, index + 1);  // Update innerHTML to preserve formatting
    
                // Call this function again for the next chunk after a short delay
                setTimeout(() => displayNextChunk(index + 1, processedText), 10); // Adjust delay as needed
            } else {
                // Once all chunks are displayed, make the input field visible again
                if (data[1] === 'Success' || data[1] === null) {
                    if (data[2]) {
                        $('#send-btn').text(data[3]);
                    }
                }
                if (data[3] === null) {
                    $('#reset-responses-button').css('display', '');
                    let p = document.createElement('p');
                    p.classList.add('notification-btm');
                    p.textContent = data[5];
                    document.querySelectorAll('.chatgpt_wrapper')[document.querySelectorAll('.chatgpt_wrapper').length - 1].appendChild(p);
                } else {
                    $('.chat-input').css('display', 'block');
                    $('.micro-ai-btn-container').css('display', '');
                    $('#reset-responses-button').css('display', '');
                    if (data[1] == "Fail" || data[1] == null || data[1] == "None" ) {
                        let p = document.createElement('p');
                        p.classList.add('notification-btm');
                        p.textContent = "You have not achieved a passing score for this phase. Please enter another response and submit again.";
                        p.style.color = 'black';
                        p.style.backgroundColor = '#ff000052';
                        document.querySelectorAll('.chatgpt_wrapper')[document.querySelectorAll('.chatgpt_wrapper').length - 1].appendChild(p);
                    }
                }
            }
        }
    
        // Start displaying chunks from the first one
        displayNextChunk(0, processedText);
    }
    $(function ($) {
        initReports();
        pElements = document.querySelectorAll('.ai-msg p');
        pElements.forEach(function(pElement) {
            let text = pElement.innerHTML;
            // Function to preprocess text and replace markers with HTML tags
            function preprocessText(text) {
                return text
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Replace **text** with <strong>text</strong>
                    .replace(/\n/g, '<br>') // Replace newlines with <br>
                    .replace(/`/g, '');
            }
    
            // Preprocess the text
            let processedText = preprocessText(text);
    
            // Set the entire processed text at once
            pElement.innerHTML = processedText;
        });
        IncreaseTextAreaHeight();
        /* Here's where you'd do things on page load. */
        });
    }

function ShowInstructions(){
    document.querySelectorAll(".accordion-item").forEach((item) => {
        item.querySelector(".accordion-item-header").addEventListener("click", () => {
            item.classList.toggle("open");
        });
    });
}
