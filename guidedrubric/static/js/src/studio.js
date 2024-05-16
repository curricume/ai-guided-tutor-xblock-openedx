/* Javascript for GuidedRubricXBlock. */
function GuidedRubricXBlock(runtime, element) {
    var block_last_phase_id = parseInt($(document).find('#last_phase_id').val());
    var handlerUrl = runtime.handlerUrl(element, 'studio_submit');


    $(element).find('#guided_rubric_add_phase').bind('click', function () {
        block_last_phase_id+=1;
        let phaseName = `<li class="field comp-setting-entry dynamic-entry is-set">
        <div class="wrapper-comp-setting-container">
        <div class="wrapper-comp-setting">
            <label class="label setting-label" for="phase_name_`+ block_last_phase_id + `">Phase Name</label>
            <input class="input setting-input phase-input-name" name="phase_name_` + block_last_phase_id +`"id="phase_name_`+ block_last_phase_id +`" value="" type="text" required/>
        </div>
        <div class="wrapper-rubric">
        <div class="wrapper-comp-setting">
            <label class="label setting-label" for="phase_question_`+block_last_phase_id+`">Question</label>
            <input class="input setting-input phase-input-question" name="phase_question_`+ block_last_phase_id + `" id="phase_question_` +block_last_phase_id +`" value="" type="text" required/>
        </div>
        <span class="tip setting-help">The question is to be displayed to the user in this phase.</span>
        </div>
        <div class="wrapper-comp-setting">
            <label class="label setting-label" for="helper_text_`+block_last_phase_id+`">Helper Text</label>
            <input class="input setting-input" id="helper_text_`+block_last_phase_id+`"  value="" type="text"/>
        </div>
        <div class="wrapper-rubric">
        <div class="wrapper-comp-setting">
            <label class="label setting-label" for="ai_instructions_`+block_last_phase_id+`">AI Instructions</label>
            <input class="input setting-input" id="ai_instructions_`+block_last_phase_id+`"  value="" type="text"/>
        </div>
        <span class="tip setting-help">The user will give you their name. Welcome them by name.</span>
        </div>
        <div class="wrapper-rubric">
        <div class="wrapper-comp-setting">
            <label class="label setting-label" for="scored_question_`+block_last_phase_id+`">Scored Question</label>
            <input type="checkbox" class="input setting-input scored_question" id="scored_question_`+block_last_phase_id+`"/>
        </div>
        <span class="tip setting-help">If this is a scored phase, then a rubric must be provided that<br> the AI can use to score a response. 
        The X-block will extract the <br>total score to determine if the user has met the threshold<br> to move on with their answer</span><br>
        </div>
        <div id="div_rubric_`+block_last_phase_id+`" class="wrapper-comp-setting" style="display:none">
            <div>
                <label class="label setting-label" for="rubric_`+block_last_phase_id+`">Rubric</label>
                <textarea class="input setting-input" id="rubric_`+block_last_phase_id+`" rows="6" cols="70"></textarea>
            </div>
            <div class="helper-content">

                <p>1. Criteria 1:
                </p><ul>
                <li>2 points - Evidence required to receive two points</li>
                <li>1 point - Evidence required to receive one point</li>
                <li>0 points - Evidence required to receive no points</li>
                </ul>
                <p></p>

                <p>2. Criteria 2:
                </p><ul>
                <li>5 points - Evidence required to receive five points</li>
                <li>3 points - Evidence required to receive three points</li>
                <li>0 points - Evidence required to receive no points</li>
                </ul>
                <p></p>
            </div>
            <div class="wrapper-rubric">
            <div class="wrapper-comp-setting"> 
            <label class="label setting-label" for="minimum_score_`+block_last_phase_id+`">Minimum Score</label>
            <input class="input setting-input" id="minimum_score_`+block_last_phase_id+`"   />
            </div>
            <span class="tip setting-help">This is the minimum total score that a user must achieve to move past this phase.</span>
            </div>
        </div>
        <div class="wrapper-comp-setting">
            <label class="label setting-label" for="button_label_`+block_last_phase_id+`">Button Label</label>
            <input class="input setting-input" id="button_label_`+block_last_phase_id+`"  type="text" value="Submit" required/>
        </div>
        </div>
        <div class="comp-remove-btn">
            <button type="button" id="phase_remove_btn_`+block_last_phase_id+`" class="phase_remove_btn">remove <span> × </span></button>
        </div>

    </li>`;

    $('.list-input.settings-list').append(phaseName)
    });


    

    $(document).on('click', '.phase_remove_btn', function() {
        let id = $(this).attr("id");
        let underscoreIndex = id.lastIndexOf('_');
        let phase_id = id.substring(underscoreIndex + 1);

        $(this).closest('li').remove();
    });


    $(document).on('change', '.scored_question', function() {
        let id = $(this).attr("id");
        let underscoreIndex = id.lastIndexOf('_');
        let phase_id = id.substring(underscoreIndex + 1);
        if ($(this).prop('checked')) {
            $('#div_rubric_'+phase_id).css('display', '')
            
        } else {
            $('#div_rubric_'+phase_id).css('display', 'none')
        }
    });


    $(element).find('.save-button').bind('click', function () {
        var form = document.getElementById('guided_rubric_form');
        var invalidFields = Array.from(form.querySelectorAll(':invalid')).reverse();
        if (invalidFields.length > 0)
        {
            invalidFields.forEach(function(field) {
                field.reportValidity();
            });
            return;
        }


        var form_data = new FormData();
        let assistant_id = $(element).find('input[name=assistant_id]').val();
        let completion_message = $(element).find('input[name=completion_message]').val();
        let display_name = $(element).find('input[name=display_name]').val();
        let short_description = $(element).find('input[name=short_description]').val();
        let max_tokens_per_user = $(element).find('input[name=max_tokens_per_user]').val();
        let completion_token = $(element).find('input[name=completion_token]').val();

        form_data.append('assistant_id', assistant_id);
        form_data.append('completion_message', completion_message);
        form_data.append('max_tokens_per_user', max_tokens_per_user);
        form_data.append('completion_token', completion_token);
        form_data.append('display_name', display_name);
        form_data.append('short_description', short_description);
       

        let phase_name = $(element).find('#phase_name').val();
        let phase_question = $(element).find('#phase_question').val();
        let last_phase_id = parseInt($(element).find('#last_phase_id').val());
        let phases = [{phase_name:phase_name}];
        // let block_phases = JSON.parse($('#json_phases').val());
        let block_phases = []
        //block_phases.push({phase_id: last_phase_id+1,phase_name:phase_name, phase_question:phase_question})
         
        var component_last_phase_id = 0;
        $(".phase-input-name").each(function() {
            var id = $(this).attr("id");
            var underscoreIndex = id.lastIndexOf('_');
            let phase_id = id.substring(underscoreIndex + 1);
            component_last_phase_id = phase_id

            let phase_name = $(this).val()
            let phase_question = $('#phase_question_'+phase_id).val()
            let phase_helper_text = $('#helper_text_'+phase_id).val()
            let phase_ai_instructions = $('#ai_instructions_'+phase_id).val()
            let scored_question = $('#scored_question_'+phase_id).prop('checked');
            var rubric = ""
            var minimum_score = 0
            if (scored_question == true)
            {
                rubric = $('#rubric_'+phase_id).val()
                minimum_score = $('#minimum_score_'+phase_id).val()
                minimum_score = (minimum_score != "") ? minimum_score : 0
            }
            let button_label = $('#button_label_'+phase_id).val()
            block_phases.push({phase_id: phase_id, phase_name:phase_name,phase_question:phase_question,
            helper_text:phase_helper_text, ai_instructions:phase_ai_instructions, 
            scored_question:scored_question,rubric:rubric,minimum_score:minimum_score,
            button_label:button_label})
            
        });

        form_data.append('phases', JSON.stringify(block_phases));
        form_data.append('last_phase_id', component_last_phase_id);
        runtime.notify('save', {
            state: 'start'
        });

        $(this).addClass("disabled");
        $.ajax({
            url: handlerUrl,
            dataType: 'json',
            cache: false,
            contentType: false,
            processData: false,
            data: form_data,
            type: "POST",
            complete: function () {
                $(this).removeClass("disabled");
            },
            success: function (response) {
                if (response.errors.length > 0) {
                    response.errors.forEach(function (error) {
                        runtime.notify("error", {
                            "message": error,
                            "title": "Guided rubric component save error"
                        });
                    });
                } else {
                    runtime.notify('save', {
                        state: 'end'
                    });
                }
            }
        });

    });

    $(element).find('.cancel-button').bind('click', function () {
        runtime.notify('cancel', {});
    });

}
